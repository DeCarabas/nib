const fs = require("fs");

const slugForName = name =>
  Buffer.from(name, "utf8")
    .toString("base64")
    .replace("/", "-")
    .replace("+", "_");

class Storage {
  constructor(path) {
    this.root = path + "/.data";
    if (!fs.existsSync(this.root)) {
      fs.mkdirSync(this.root);
    }
  }

  getDocument(name, callback) {
    const slug = slugForName(name);
    fs.readFile(this.root + "/" + slug, (err, data) => {
      if (err && err.code != "ENOENT") {
        callback(err, null);
      } else {
        try {
          const content = data ? JSON.parse(data.toString("utf8")) : null;
          callback(null, { content });
        } catch (err) {
          callback(err, null);
        }
      }
    });
  }

  setDocument(name, contentType, content, callback) {
    const slug = slugForName(name);
    const data = Buffer.from(JSON.stringify({ contentType, content }), "utf8");
    fs.writeFile(this.root + "/" + slug, data, err => {
      callback(err);
    });
  }
}

module.exports = { Storage };
