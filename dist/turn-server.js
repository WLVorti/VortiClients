"use strict";
const Turn = require('node-turn');
const TURN_PORT = parseInt(process.env.TURN_PORT || '3478');
const TURN_SECRET = process.env.TURN_SECRET || 'turn-secret-key';
const server = new Turn({
    listeningPort: TURN_PORT,
    authMech: 'long-term',
    credentials: {
        user: TURN_SECRET,
    },
    realm: 'vorti-messenger',
});
server.start();
console.log(`\x1b[36m[TURN]\x1b[0m TURN server running on port ${TURN_PORT}`);
