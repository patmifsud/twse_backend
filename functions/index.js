const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { service } = require("firebase-functions/v1/analytics");

// firebase emulators:start
// http://localhost:5000
//firebase deploy --only functions

admin.initializeApp();

const config = {
  dailyTokens: 20,
};

// firestore trigger for tracking activity
exports.siteAdded = functions.firestore
  .document("/sites/{id}")
  .onCreate((snap, context) => {
    const limiterPath = admin.firestore().collection("backend").doc("limiter");
    let success = true;

   // Do we have query tokens? 
   limiterPath.get()

      .then((doc) => {
         if (doc.exists) {
            console.log("Connected to backend:", doc.data());
            return(doc.data());
         } else throw "Unable to connect to backend DB";
      })

      .then(async (limiterStatus) => {
         console.log("Limiter status");
         if (limiterStatus.date != generateDateStr()) {
            await limiterReset();
         }
         if (limiterStatus.tokens < 1) {
            throw "Not enough request tokens remaining for today";
         }
         return(limiterStatus);
      })
      
      .then((limiterStatus) => {
         removeToken(limiterStatus.tokens);
      })
      
      .then(() => {
         console.log("api stuff here")
      })
      
      .catch((error) => {
         console.error("Unable to create new site: ", error);
         success = false;
      });


    //-------------------------------------------
    // Token Limiter functions



    function removeToken(tokenNum) {
      const date = generateDateStr();
      const newTokenValue = tokenNum - 1;

      limiterPath
        .set({
          date: date,
          tokens: newTokenValue
        })
        .then(() => {
          console.log(
            `One token has been removed, ${newTokenValue} remaining today`
          );
          return Promise.resolve();
        })
        .catch(() => {
          console.error("Unable to remove a token");
          success = false;
        });
    }


    function generateDateStr() {
      const now = new Date();
      return `${now.getUTCFullYear()}-${now.getMonth()}-${now.getDay()}`;
    }



  function limiterReset() {
      const date = generateDateStr();

      console.log(
        `reseting limiter to ${config.dailyTokens} tokens for date ${date}`
      );

      try {
         limiterPath
         .set({
            date: date,
            tokens: config.dailyTokens,
         }).then(() => {
            console.log(`limiter has been updated`);
         })
      }
         catch(error){
          console.error("Unable to reset limiter", error);
          success = false;
      };

      return Promise.resolve();
    }

    //-------------------------------------------
    // GPT functions

 

    return Promise.resolve(); 
    });
