const functions = require("firebase-functions");
const admin = require("firebase-admin");
const OpenAI = require("openai-api");
const axios = require("axios").default;

// firebase emulators:start
// http://localhost:5000
//firebase deploy --only functions

admin.initializeApp();

//---------------------------------------
// CONFIG
const config = {
  dailyTokens: 20,
  prompts: {
    gptTagline: (topic, adj, type) => {
      return `Write a ${adj}, compelling, one sentence tag line for a ${type} about '${topic}'.`;
    },
    gptIntro: (topic, adj, type) => {
      return `Write an ${adj}, two paragraph introduction for a ${type} about '${topic}'.`;
    },
    gptMain: (topic, adj, type) => {
      return `Write one ${adj}, engaging paragraph describing why this ${type} about '${topic}' was created.`;
    },
    gptCta: (topic, adj, type) => {
      return `Write a short, compelling, one sentence call to action to learn more. It should be ${adj} in tone. It is for a sign up form on ${type} about '${topic}'.`;
    },
    gptQuote: (topic, adj, type) => {
      return `Write a ${adj}, personal quote from the founder of this ${type} about '${topic}'.`;
    },
  },
};

let gptKey = functions.config().openai.key;
let xrapidapiKey = functions.config().xrapidapi.key;
const limiterPath = admin.firestore().collection("backend").doc("limiter");


// firestore trigger for tracking activity
exports.siteAdded = functions.firestore
  .document("/sites/{id}")
  .onCreate((snap, context) => {
    return new Promise((resolve, reject) => {
      const openai = new OpenAI(gptKey);
      const sitesPath = admin.firestore().collection("sites").doc(context.params.id);

      let limiterStatus = {};

      let input = snap.data();
      const date = generateDateStr();
      let promptArray = [];
      const generatePromptArray = function () {
        console.log(input);
        Object.values(config.prompts).map((value) => {
          promptArray.push(
            value.call(null, input.siteTopic, input.siteAdjective, input.siteType)
          );
        });
      };

      //---------------------------------------
      // OPEN AI API
      // Remove 1 token from the database
      async function getAiResponce() {
        generatePromptArray();
        console.log("Getting GPT data");

        const gptResponse = await openai.complete({
          engine: "davinci-instruct-beta",
          prompt: promptArray,
          maxTokens: 120,
          temperature: 0.7,
          topP: 1,
          presencePenalty: 0,
          frequencyPenalty: 0,
          bestOf: 1,
          n: 1,
          stream: false,
        });
        console.log("Got GPT Data");
        updateSiteDb(gptResponse.data.choices);
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
      // Add GPT responce to the DB
      function updateSiteDb(gpt) {
        sitesPath
          .update({
            gptTagline: gpt[0].text,
            gptIntro: gpt[1].text,
            gptMain: gpt[2].text,
            gptCta: gpt[3].text,
            gptQuote: gpt[4].text,
            loadingGpt: false,
          })
          .then(() => {
            console.log(`Updated site record in db successfully`);
            resolve("completed");
          })
          .catch((error) => {
            console.error("Unable to add GPT response to db", error);
            reject("Failed");
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
      addImagesToDb(input.siteTopic, sitesPath);
      getLimiter();
    });
  });



const addImagesToDb = async function (topic, thisSitePath) {
  return new Promise((resolve, reject) => {

    console.log("getting images");
    images = [];

    const options = {
      method: "GET",
      url: "https://contextualwebsearch-websearch-v1.p.rapidapi.com/api/Search/ImageSearchAPI",
      params: {
        q: topic,
        pageNumber: "1",
        pageSize: "2",
        autoCorrect: "true",
        safeSearch: "true",
      },
      headers: {
        "x-rapidapi-host": "contextualwebsearch-websearch-v1.p.rapidapi.com",
        "x-rapidapi-key": xrapidapiKey,
      },
    };

    axios
      .request(options)
      .then((response) => {
        console.log("got images ", response.data.value[0].url);
        images = [response.data.value[0].url, response.data.value[1].url];
      })
      .then(()=> {
        thisSitePath
        .update({
          images: [...images],
        })
        .then(() => {
          resolve("completed");
        })
      })
      .catch((err) => {
        console.error("image search failed for", topic, " ", err);
        reject("Canceling addImagesToDb");
      });
  })
};
