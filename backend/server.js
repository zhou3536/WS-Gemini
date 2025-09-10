import dotenv from 'dotenv';
dotenv.config();
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import cookieParser from 'cookie-parser';
import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Server } from "socket.io";
import { initializeUsers } from './users.js';
import { initializeGemini } from './gemini.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = http.createServer(app);

const host = process.env.HOST || '127.0.0.1';
const port = process.env.PORT || 3000;
const COOKIE_SECRET = process.env.cookieSecret;
const CacheControl = process.env.CacheControl;

const loadJson = async () => {
    const filePath = './users.json';
    try {
        if (!fs.existsSync(filePath)) await writeFile(filePath, '[]', 'utf-8');
        const content = await readFile(filePath, 'utf-8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`读取或创建 ${filePath} 失败:`, err);
        process.exit(1);
    }
};
let users = await loadJson();

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    allowRequest: (req, callback) => {
        cookieParser(COOKIE_SECRET)(req, {}, () => {
            callback(null, true);
        });
    }
});

app.use(express.json());

app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { maxAge: CacheControl }));

initializeUsers(app, users);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: CacheControl }));

initializeGemini(users, io);








server.listen(port, host, () => { console.log(`服务启动成功！监听地址：http://${host}:${port}`); });
