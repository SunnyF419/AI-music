const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const model = process.env.TRANSCRIPTION_MODEL || "gpt-4o-mini-transcribe";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".lrc": "text/plain; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".webm": "audio/webm"
};

function send(response, status, body, headers = {}) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    ...headers
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function resolvePublicFile(src) {
  const parsed = new URL(src, `http://localhost:${port}`);
  const decodedPath = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  const filePath = path.resolve(root, decodedPath);

  if (!filePath.startsWith(root)) {
    throw new Error("Audio path escapes project root.");
  }

  return filePath;
}

function multipartBody(fields, file) {
  const boundary = `----ai-music-${Date.now().toString(16)}`;
  const chunks = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    chunks.push(Buffer.from(`Content-Disposition: form-data; name="${name}"\r\n\r\n`));
    chunks.push(Buffer.from(`${value}\r\n`));
  }

  chunks.push(Buffer.from(`--${boundary}\r\n`));
  chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`));
  chunks.push(Buffer.from(`Content-Type: ${file.type}\r\n\r\n`));
  chunks.push(file.buffer);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  return {
    boundary,
    body: Buffer.concat(chunks)
  };
}

function lyricsFromTranscription(data) {
  if (Array.isArray(data.segments) && data.segments.length) {
    return data.segments.map((segment) => ({
      time: Number(segment.start || 0),
      text: String(segment.text || "").trim()
    })).filter((line) => line.text);
  }

  return String(data.text || "")
    .split(/\n+/)
    .map((text, index) => ({ time: index * 8, text: text.trim() }))
    .filter((line) => line.text);
}

async function transcribe(request, response) {
  const apiKey = process.env.OPENAI_API_KEY || "";

  if (!apiKey) {
    send(response, 500, JSON.stringify({ error: "OPENAI_API_KEY is not set. Set it to your real OpenAI API key before running npm start." }), {
      "Content-Type": "application/json; charset=utf-8"
    });
    return;
  }

  if (apiKey.includes("你的") || /[^\x00-\x7F]/.test(apiKey)) {
    send(response, 500, JSON.stringify({ error: "OPENAI_API_KEY is still a placeholder or contains non-ASCII characters. Replace it with your real OpenAI API key." }), {
      "Content-Type": "application/json; charset=utf-8"
    });
    return;
  }

  try {
    const payload = await readJson(request);
    const audioPath = resolvePublicFile(payload.src);
    const extension = path.extname(audioPath).toLowerCase();
    const buffer = fs.readFileSync(audioPath);
    const { boundary, body } = multipartBody({
      model,
      response_format: "verbose_json",
      "timestamp_granularities[]": "segment"
    }, {
      name: path.basename(audioPath),
      type: mimeTypes[extension] || "application/octet-stream",
      buffer
    });

    const openaiResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": String(body.length)
      },
      body
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      send(response, openaiResponse.status, JSON.stringify(data), {
        "Content-Type": "application/json; charset=utf-8"
      });
      return;
    }

    send(response, 200, JSON.stringify({ lyrics: lyricsFromTranscription(data) }), {
      "Content-Type": "application/json; charset=utf-8"
    });
  } catch (error) {
    send(response, 500, JSON.stringify({ error: error.message }), {
      "Content-Type": "application/json; charset=utf-8"
    });
  }
}

function serveStatic(request, response) {
  const parsed = new URL(request.url, `http://localhost:${port}`);
  const routePath = parsed.pathname === "/" ? "/index.html" : parsed.pathname;
  const filePath = path.resolve(root, decodeURIComponent(routePath.replace(/^\/+/, "")));

  if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    send(response, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extension] || "application/octet-stream";
  const stat = fs.statSync(filePath);
  const range = request.headers.range;

  if (range && contentType.startsWith("audio/")) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    const start = match && match[1] ? Number(match[1]) : 0;
    const end = match && match[2] ? Number(match[2]) : stat.size - 1;

    if (!match || start >= stat.size || end >= stat.size || start > end) {
      response.writeHead(416, {
        "Content-Range": `bytes */${stat.size}`,
        "Accept-Ranges": "bytes"
      });
      response.end();
      return;
    }

    response.writeHead(206, {
      "Content-Type": contentType,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath, { start, end }).pipe(response);
    return;
  }

  send(response, 200, fs.readFileSync(filePath), {
    "Content-Type": contentType,
    "Accept-Ranges": contentType.startsWith("audio/") ? "bytes" : "none"
  });
}

http.createServer((request, response) => {
  if (request.method === "OPTIONS") {
    send(response, 204, "");
    return;
  }

  if (request.method === "POST" && request.url.startsWith("/api/transcribe")) {
    transcribe(request, response);
    return;
  }

  if (request.method === "GET") {
    serveStatic(request, response);
    return;
  }

  send(response, 405, "Method not allowed", { "Content-Type": "text/plain; charset=utf-8" });
}).listen(port, () => {
  console.log(`AI Music Player running at http://localhost:${port}`);
});
