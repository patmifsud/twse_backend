const functions = require("firebase-functions");

exports.buildPageRequest = functions.https.onCall((data, context) => {
   // check if we have enough deploy tokens in service/deploys
   return `hello`;
}); 
