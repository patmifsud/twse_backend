const functions = require("firebase-functions");
const admin = require("firebase-admin");
const OpenAI = require("openai-api");

// firebase emulators:start
// http://localhost:5000
//firebase deploy --only functions

admin.initializeApp();


//---------------------------------------
// CONFIG
const config = {
  dailyTokens: 20,
  prompts: {
     gptIcon : (topic, adj) => {
        return ``
      },
     gptIcon : "",
     gptIcon : "",
     gptIcon : "",
     gptIcon : "",
  }
};

// var preloadImgs = function(){
//    Object.values(config.prompts).map(value => {
//       value.call(topic, adj);
//    })
// };

let key = functions.config().openai.key;

// firestore trigger for tracking activity
exports.siteAdded = functions.firestore
  .document("/sites/{id}")
  .onCreate((snap, context) => {
    return new Promise((resolve, reject) => {
      let limiterStatus = {};
      let input = snap.data();
      const date = generateDateStr();
      const openai = new OpenAI(key);

      const limiterPath = admin
        .firestore()
        .collection("backend")
        .doc("limiter");


      //---------------------------------------
      // OPEN AI API
      // Remove 1 token from the database
      async function getAiResponce() {
        const gptResponse = await openai.complete({
          engine: "davinci",
          prompt: `${input.siteTopic}`,
          maxTokens: 10,
          temperature: 0.9,
          topP: 1,
          presencePenalty: 0,
          frequencyPenalty: 0,
          bestOf: 1,
          n: 1,
          stream: false,
          stop: ["\n", "testing"],
        });
        console.log(gptResponse.data);
        resolve("completed");
      }


      //---------------------------------------
      // WRITE TO DB
      // Remove 1 token from the database
      function removeToken() {
         const newTokenValue = parseInt(limiterStatus.tokens) - 1;
 
         limiterPath
           .set({
             date: date,
             tokens: newTokenValue,
           })
           .then(() => {
             console.log(
               `One token has been removed, ${newTokenValue} remaining today`
             );
             getAiResponce();
           })
           .catch(() => {
             console.error("Unable to remove a token");
             reject("Unable to remove a token");
           });
       }

      //---------------------------------------
      // LIMITER
      // Get limiter
      function getLimiter() {
        limiterPath
          .get()
          .then((doc) => {
            if (doc.exists) {
              console.log("Connected to backend:", doc.data());
              limiterStatus = {
                date: doc.data().date,
                tokens: doc.data().tokens,
              };
              checkLimiter();
            } else throw error("No data found");
          })
          .catch((error) => {
            console.error(error);
            reject("Unable to get limiter data");
          });
      }
      // Check if limiter date is from today, and tokens are > 1
      function checkLimiter() {
        console.log("Checking the limiter");
        if (limiterStatus.date != date) {
          limiterReset();
        } else if (limiterStatus.tokens < 1) {
          throw "Not enough request tokens remaining for today";
        } else {
          removeToken();
        }
      }
      // If limiter date isn't today, set date to today and set tokens to full
      function limiterReset() {
        console.log(
          `reseting limiter to ${config.dailyTokens} tokens for date ${date}`
        );
        try {
          limiterPath
            .set({
              date: date,
              tokens: config.dailyTokens,
            })
            .then(() => {
              console.log(`limiter has been updated`);
              removeToken();
            });
        } catch (error) {
          reject("Unable to reset limiter");
        }
      }


      //---------------------------------------
      // HELPERS
      // Make date string
      function generateDateStr() {
        const now = new Date();
        return `${now.getUTCFullYear()}-${now.getMonth()}-${now.getDay()}`;
      }

      //---------------------------------------
      // START
      getLimiter();
    });
  });
