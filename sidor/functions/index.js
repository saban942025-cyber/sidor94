const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Processes new messages in team chats for idempotency and notifications.
 * Listens for new documents in: /teamChats/{chatId}/messages/{messageId}
 */
exports.teamNotificationProcessor = functions.firestore
  .document("teamChats/{chatId}/messages/{messageId}")
  .onCreate(async (snap, context) => {
    const message = snap.data();
    const { chatId, messageId } = context.params;

    const chatRef = db.collection("teamChats").doc(chatId);

    try {
      // --- 1. Idempotency Check ---
      // We use a separate subcollection for processed IDs to avoid
      // read/write contention on the main chat document.
      const processedRef = chatRef.collection("meta").doc("processedMessages");
      
      let processedIds = [];
      const processedSnap = await processedRef.get();
      if (processedSnap.exists) {
        processedIds = processedSnap.data().ids || [];
      }
      
      if (processedIds.includes(messageId)) {
        functions.logger.log(`Idempotency check: Message ${messageId} already processed.`);
        return null; // Stop execution
      }

      // --- 2. Process the message (e.g., send FCM) ---
      
      // Get chat participants
      const chatDoc = await chatRef.get();
      const memberIds = chatDoc.data()?.memberIds || [];
      const recipientId = memberIds.find(id => id !== message.senderId);

      if (recipientId) {
        // Get recipient's FCM token
        const recipientDoc = await db.collection("teamMembers").doc(recipientId).get();
        const fcmToken = recipientDoc.data()?.fcmToken;

        if (fcmToken) {
          // Send FCM Notification
          const payload = {
            notification: {
              title: `הודעה חדשה מ-${message.senderName}`,
              body: message.type === 'text' ? message.text : 'שלח קובץ',
              sound: 'default', // Or 'soft_ping.mp3' if configured in client
              badge: '1',
            },
            data: {
              chatId: chatId,
              senderId: message.senderId,
            }
          };
          
          functions.logger.log(`Sending FCM to ${recipientId}`, payload);
          await admin.messaging().sendToDevice(fcmToken, payload);
        } else {
          functions.logger.warn(`Recipient ${recipientId} has no FCM token.`);
        }
      }

      // --- 3. Mark as processed (Idempotency) ---
      await processedRef.set({
        ids: admin.firestore.FieldValue.arrayUnion(messageId)
      }, { merge: true });

      functions.logger.log(`Successfully processed team message: ${messageId}`);
      return null;

    } catch (error) {
      functions.logger.error(`Error in teamNotificationProcessor for msg ${messageId}:`, error);
      return null;
    }
  });

/**
 * Periodically cleans up 'isTyping' flags for disconnected users.
 * (This is a more robust alternative to client-side timeouts)
 *
 * Note: This requires a paid Firebase plan (Blaze) to run scheduled functions.
 * As a fallback, the client-side code uses 'lastSeen' timestamps.
 */
// exports.typingIndicatorCleanup = functions.pubsub.schedule('every 5 minutes').onRun(async (context) => {
//   const now = admin.firestore.Timestamp.now();
//   const cutoff = new admin.firestore.Timestamp(now.seconds - 30, 0); // 30 seconds ago
// 
//   const snapshot = await db.collection("teamMembers")
//                            .where("isTyping", "==", true)
//                            .where("lastSeen", "<", cutoff)
//                            .get();
// 
//   if (snapshot.empty) {
//     functions.logger.log("No stale typing indicators to clean up.");
//     return null;
//   }
// 
//   const batch = db.batch();
//   snapshot.forEach(doc => {
//     batch.update(doc.ref, { isTyping: false });
//   });
//   
//   await batch.commit();
//   functions.logger.log(`Cleaned up ${snapshot.size} stale typing indicators.`);
//   return null;
// });
