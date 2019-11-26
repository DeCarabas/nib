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
      const content = data ? data.toString("utf8") : null;
      if (err && err.code != "ENOENT") {
        callback(err, null);
      } else {
        callback(null, content);
      }
    });
  }

  setDocument(name, content, callback) {
    const slug = slugForName(name);
    fs.writeFile(this.root + "/" + slug, Buffer.from(content, "utf8"), err => {
      callback(err);
    });
  }
}

module.exports = { Storage };
