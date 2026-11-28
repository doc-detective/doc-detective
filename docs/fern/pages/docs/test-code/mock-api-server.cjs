// Stand-in mock backend for the inline tests in mock-backend.mdx: answers like
// Prism's static mock does, with no extra dependency. Any /users/{id} gets the
// 200 example; `Prefer: code=404` gets the 404 example instead.
const examples = {
  200: { id: 1, name: 'Ada Lovelace', role: 'admin' },
  404: { error: 'User not found.' },
};

require('http')
  .createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://127.0.0.1');
    if (!/^\/users\/\d+$/.test(pathname)) {
      res.writeHead(404).end();
      return;
    }
    const code = /code=404/.test(req.headers.prefer || '') ? 404 : 200;
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(examples[code]));
  })
  .listen(4010, () => console.log('Mock API listening on port 4010'));
