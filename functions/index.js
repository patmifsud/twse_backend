const functions = require("firebase-functions");
const admin = require('firebase-admin');

admin.initializeApp();



// firestore trigger for tracking activity
exports.logActivities = functions.firestore.document('/{collection}/{id}')
  .onCreate((snap, context) => {
     
      console.log("new entry to DB");

    console.log(snap.data());

    return null;
});
