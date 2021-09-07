const functions = require("firebase-functions");
const admin = require("firebase-admin");

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
    return new Promise((resolve, reject) => {
      let limiterStatus = {};
      let prompt = snap.data();
      let key = functions.config().openai.key;
      const date = generateDateStr();

      const limiterPath = admin
        .firestore()
        .collection("backend")
        .doc("limiter");

      // Get limiter data from db
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

      // Make date string
      function generateDateStr() {
        const now = new Date();
        return `${now.getUTCFullYear()}-${now.getMonth()}-${now.getDay()}`;
      }

      // Make date string
      async function getKey() {
         try {
            return functions.config().openai.key;
          } catch (error) {
            console.log("couldn't get the openai key. ")
            key = 'diio'
          }
      }

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
            doNextThing();
          })
          .catch(() => {
            console.error("Unable to remove a token");
            reject("Unable to remove a token");
          });
      }

      // Remove 1 token from the database
      function doNextThing() {
        console.log(prompt);
        console.log("key:", key);
        resolve("completed");
      }

      getLimiter();
    });
  });
