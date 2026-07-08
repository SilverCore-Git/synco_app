import { io } from "socket.io-client";

const socket = io("wss://localhost:5174", {
    path: "/socket",
    transports: ["websocket"],
    rejectUnauthorized: false,
    auth: { token: "fake_token" }
});

socket.on("connect", () => {
    console.log("Connected!");
    process.exit(0);
});

socket.on("connect_error", (err) => {
    console.error("Connect error:", err.message);
    process.exit(0);
});

socket.on("disconnect", (reason) => {
    console.error("Disconnected:", reason);
    process.exit(0);
});

console.log("Connecting...");
