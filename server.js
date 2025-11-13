import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();
app.use(cors());
app.get("/", (req, res) => res.send("Bingo server is running"));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3000;

// In-memory store for rooms and admin per room
const rooms = {}; // { roomId: { adminId: string|null, players: [{id,name}], numbers: [] } }

io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  socket.on("create-room", (roomId) => {
    if (!rooms[roomId]) {
      rooms[roomId] = {
        adminId: socket.id,
        players: [],
        numbers: [],
        calledNumbers: [],
      };
      socket.join(roomId);
      socket.emit("room-created", roomId);
      io.to(roomId).emit(
        "system-message",
        `Sala ${roomId} creada. Administrador: ${socket.id}`
      );
      console.log(`🏠 Room created: ${roomId} by ${socket.id}`);
    } else {
      socket.emit("error-room", "La sala ya existe");
    }
  });

  socket.on("join-room", (roomId, playerName) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("error-room", "La sala no existe");
      return;
    }
    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomId);
    io.to(roomId).emit(
      "player-joined",
      room.players.map((p) => p.name)
    );
    console.log(`👤 ${playerName} joined ${roomId}`);
  });

  socket.on("request-admin", (roomId) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("admin-denied", "La sala no existe");
      return;
    }
    if (!room.adminId) {
      room.adminId = socket.id;
      socket.emit("admin-approved");
      io.to(roomId).emit("system-message", "Se asignó un administrador");
      console.log(`✅ Admin assigned ${socket.id} in ${roomId}`);
    } else {
      socket.emit("admin-denied", "Ya existe un administrador");
    }
  });

  socket.on("call-number", (roomId) => {
  const room = rooms[roomId];
  if (!room) return;

  // Solo el administrador puede sacar números
  if (room.adminId !== socket.id) {
    socket.emit("error-msg", "Solo el administrador puede sacar números");
    return;
  }

  if (!room.calledNumbers) room.calledNumbers = [];

  let newNumber;
  do {
    newNumber = Math.floor(Math.random() * 75) + 1;
  } while (
    room.calledNumbers.some(
      (n) => n === newNumber || n.number === newNumber
    )
  );

  const letter = getLetterForNumber(newNumber);
  const called = { letter, number: newNumber };

  room.calledNumbers.push(called);
  io.to(roomId).emit("number-called", called);

  console.log(`🔢 Número ${letter}${newNumber} llamado en la sala ${roomId}`);
});


  socket.on("player-bingo", (roomId, playerName, card) => {
  const room = rooms[roomId];
  if (!room) return;

  // Números que han sido llamados en esa sala
  const calledNums = room.calledNumbers.map((c) => c.number);

  // Verificamos si la tarjeta del jugador es válida
  const valid = validateBingo(card, calledNums);

  if (valid) {
    // Si es un bingo correcto, avisamos a todos los jugadores
    io.to(roomId).emit("winner", playerName);
    console.log(`🏆 ${playerName} hizo BINGO válido en ${roomId}`);
  } 
  
  else {
    // Si no es válido, solo avisamos al jugador que intentó
    socket.emit("invalid-bingo");
    console.log(`❌ ${playerName} intentó un bingo inválido en ${roomId}`);
  }
});





  socket.on("mark-cell", (roomId, number, callback) => {
    const room = rooms[roomId];
    if (!room) {
      callback({ success: false, message: "La sala no existe" });
      return;
    }

    // Revisamos si el número ya fue llamado
    const wasCalled = room.calledNumbers.some((n) => n.number === number);

    if (wasCalled) {
      callback({ success: true });
      console.log(`✅ El jugador ${socket.id} marcó correctamente ${number} en ${roomId}`);
    } else {
      callback({ success: false, message: "Ese número aún no ha salido." });
      console.log(`🚫 Jugador ${socket.id} intentó marcar ${number} sin haber salido en ${roomId}`);
    }
  });



  



  socket.on("disconnecting", () => {
    const sRooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
    sRooms.forEach((roomId) => {
      const room = rooms[roomId];
      if (!room) return;
      // remove player if present
      room.players = room.players.filter((p) => p.id !== socket.id);
      if (room.adminId === socket.id) {
        room.adminId = null;
        io.to(roomId).emit("system-message", "El administrador se desconectó");
      }
      io.to(roomId).emit(
        "player-joined",
        room.players.map((p) => p.name)
      );
      console.log(`🔴 ${socket.id} left ${roomId}`);
    });
  });
});

function getLetterForNumber(num) {
  if (num <= 15) return "B";
  if (num <= 30) return "I";
  if (num <= 45) return "N";
  if (num <= 60) return "G";
  return "O";
}



// function validateBingo(card, calledNumbers) {
//   const marked = card.map((row) =>
//     row.map((num) => num === "FREE" || calledNumbers.includes(num))
//   );

//   // filas
//   for (let row of marked) {
//     if (row.every((v) => v)) return true;
//   }
//   // columnas
//   for (let c = 0; c < 5; c++) {
//     if (marked.every((row) => row[c])) return true;
//   }
//   // diagonales
//   if ([0, 1, 2, 3, 4].every((i) => marked[i][i])) return true;
//   if ([0, 1, 2, 3, 4].every((i) => marked[i][4 - i])) return true;

//   return false;
// }


function validateBingo(card, calledNumbers) {
  const marked = card.map((row) =>
    row.map((num) => num === "FREE" || calledNumbers.includes(num))
  );

  // FULL CARD — todas las casillas marcadas
  return marked.every((row) => row.every((v) => v));
}



server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

