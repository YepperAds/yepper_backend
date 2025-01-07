// websocketServer.js
const ImportAd = require('../models/ImportAdModel');
const AdSpace = require('../models/AdSpaceModel');

function setupWebSocketServer(server, io) {
  const clients = new Map();

  io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('subscribe', (userId) => {
      console.log('User subscribed:', userId);
      clients.set(userId, socket);
      socket.userId = userId;
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.userId);
      if (socket.userId) {
        clients.delete(socket.userId);
      }
    });
  });

  const changeStream = ImportAd.watch();
  
  changeStream.on('change', async (change) => {
    try {
      console.log('Change detected:', change.operationType);
      
      if (change.operationType === 'insert') {
        const newAd = change.fullDocument;
        console.log('New ad inserted:', newAd._id);
        
        // Notify website owners
        for (const spaceId of newAd.selectedSpaces) {
          const adSpace = await AdSpace.findById(spaceId).populate('webOwnerId');
          if (adSpace && adSpace.webOwnerId) {
            const socket = clients.get(adSpace.webOwnerId.toString());
            if (socket) {
              console.log('Sending notification to owner:', adSpace.webOwnerId);
              socket.emit('notification', {
                type: 'newPendingAd',
                businessName: newAd.businessName,
                adId: newAd._id,
                timestamp: new Date(),
                read: false
              });
            }
          }
        }
      }
      
      if (change.operationType === 'update' && 
          change.updateDescription.updatedFields && 
          change.updateDescription.updatedFields.approved === true) {
        const updatedAd = await ImportAd.findById(change.documentKey._id);
        if (updatedAd) {
          const socket = clients.get(updatedAd.userId.toString());
          if (socket) {
            console.log('Sending approval notification to user:', updatedAd.userId);
            socket.emit('notification', {
              type: 'adApproved',
              businessName: updatedAd.businessName,
              adId: updatedAd._id,
              timestamp: new Date(),
              read: false
            });
          }
        }
      }
    } catch (error) {
      console.error('Error in change stream handler:', error);
    }
  });

  return io;
}

module.exports = setupWebSocketServer;
