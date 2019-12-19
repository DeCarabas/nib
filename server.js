const express = require("express");
const sqlite = require("sqlite3").verbose();
const tshook = require("./tshook.js");

const app = express();
app.use(tshook.watch("."));
app.use(express.static("ui"));
app.use(express.json());

app.get("/", (_, response) => {
  console.log("OK");
  response.sendFile("ui/index.html");
});

app.get("/image/local/content/:id", (request, response) => {
  db.get(
    `SELECT content, contentType FROM Documents WHERE name=?`,
    [request.params.id],
    (err, row) => {
      if (err) {
        response.status(500).json(err);
      } else if (row === undefined) {
        response.sendStatus(404);
      } else {
        response.json(row);
      }
    }
  );
});

app.put("/image/local/content/:id", (request, response) => {
  db.run(
    `INSERT INTO Documents (name, content, contentType) VALUES (?, ?, ?)
     ON CONFLICT(name)
     DO UPDATE SET content=excluded.content, contentType=excluded.contentType`,
    [request.params.id, request.body.content, request.body.contentType],
    (_, err) => {
      if (err) {
        response.status(500).json(err);
      } else {
        response.sendStatus(200);
      }
    }
  );
});

app.post("/image/local/db", (request, response) => {
  // The fact that this can break the local database is OK, and in fact is
  // on purpose.
  const { query, params } = request.body;
  db.run(query, params, (results, error) => {
    if (err) {
      response.status(500).json({ error });
    } else {
      response.status(200).json({ results });
    }
  });
});

let listener;
const db = new sqlite.Database(".data/nib.db", err => {
  if (err) {
    return console.error(err.message);
  }

  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS Documents (
          name text primary key,
          contentType text,
          content text
        )`
    );
  });
  listener = app.listen(process.env.PORT, () => {
    console.log(`Your app is listening on port ${listener.address().port}`);
    if (process.env.NODE_ENV !== "production") {
      require("open")("http://localhost:" + listener.address().port + "/");
    }
  });
});
