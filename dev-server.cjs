const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 5173);
const host = "127.0.0.1";
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = http.createServer((request, response) => {
  const route = request.url === "/" ? "/index.html" : request.url;
  const filePath = path.join(__dirname, decodeURIComponent(route));

  if (!filePath.startsWith(__dirname)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "text/plain; charset=utf-8",
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`PianoTrainer is running at http://${host}:${port}`);
});
