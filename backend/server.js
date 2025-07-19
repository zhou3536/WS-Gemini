require("dotenv").config();
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("错误：请在 .env 文件中设置您的 GEMINI_API_KEY");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
const historiesDir = path.join(__dirname, "histories");
if (!fs.existsSync(historiesDir)) {
    fs.mkdirSync(historiesDir);
}

app.use(express.static(path.join(__dirname, "public")));

wss.on("connection", (ws) => {
    console.log("客户端已连接");

    ws.on("message", async (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case "newMessage":
                await handleNewMessage(ws, data);
                break;
            case "loadHistory":
                await handleLoadHistory(ws, data.sessionId);
                break;
        }
    });

    ws.on("close", () => {
        console.log("客户端已断开");
    });
});

async function handleNewMessage(ws, data) {
    let { sessionId, prompt, files, model, useWebSearch } = data;

    // 1. 会话和历史记录管理
    if (!sessionId) {
        sessionId = `${Date.now()}.json`;
        ws.send(JSON.stringify({ type: "sessionCreated", sessionId }));
        fs.writeFileSync(path.join(historiesDir, sessionId), JSON.stringify([]));
    }

    const historyPath = path.join(historiesDir, sessionId);
    let history = JSON.parse(fs.readFileSync(historyPath, "utf-8"));

    // 2. 构建请求
    const userMessage = { role: "user", parts: [{ text: prompt }] };
    if (files && files.length > 0) {
        const fileParts = files.map(file => ({
            inlineData: {
                data: file.data,
                mimeType: file.mimeType,
            },
        }));
        userMessage.parts.push(...fileParts);
    }

    // 3. 调用Gemini API
    try {
        const generationConfig = {
            // temperature: 0.7, // 可以根据需要调整
        };
        const geminiModel = genAI.getGenerativeModel({ model, generationConfig });

        const chat = geminiModel.startChat({
            history: history,
            generationConfig: {
                // maxOutputTokens: 100, // 根据需要调整
            },
        });

        const result = await chat.sendMessageStream(userMessage.parts);

        let fullResponse = "";
        for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullResponse += chunkText;
            ws.send(JSON.stringify({ type: "streamChunk", chunk: chunkText }));
        }

        // 4. 保存历史记录
        history.push(userMessage);
        history.push({ role: "model", parts: [{ text: fullResponse }] });
        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));

        ws.send(JSON.stringify({ type: "streamEnd" }));

    } catch (error) {
        console.error("Gemini API 调用失败:", error);
        ws.send(JSON.stringify({ type: "error", message: "与Gemini的通信出现问题。" }));
    }
}

async function handleLoadHistory(ws, sessionId) {
    const historyPath = path.join(historiesDir, sessionId);
    if (fs.existsSync(historyPath)) {
        const history = fs.readFileSync(historyPath, "utf-8");
        ws.send(JSON.stringify({ type: "historyLoaded", history: JSON.parse(history) }));
    } else {
        // 如果找不到历史文件，可能需要通知前端
        ws.send(JSON.stringify({ type: "error", message: "找不到指定的会话历史。" }));
    }
}

server.listen(PORT, () => {
    console.log(`服务器正在 http://localhost:${PORT} 上运行`);
});
