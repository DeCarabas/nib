export class Storage {
  root: string;

  constructor(path: string) {
    this.root = path + "/.data";
  }

  getDocument(name: string, callback: { (arg0: any, arg1: any): void }) {
    fetch("/image/local/content/" + name)
      .then(resp => {
        if (resp.status === 200) {
          resp.json().then(data => callback(null, data));
        } else if (resp.status === 404) {
          callback(null, { content: null });
        } else {
          callback(resp.statusText, null);
        }
      })
      .catch(reason => callback(reason, null));
  }

  setDocument(
    name: string,
    contentType: string,
    content: string,
    callback: { (arg0: any): void }
  ) {
    fetch("/image/local/content/" + name, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      redirect: "follow",
      body: JSON.stringify({ contentType, content })
    })
      .then(resp => callback(resp.status === 200 ? null : resp.statusText))
      .catch(reason => callback(reason));
  }
}
