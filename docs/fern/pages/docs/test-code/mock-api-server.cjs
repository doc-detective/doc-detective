// Stand-in mock backend for the inline tests in mock-backend.mdx: answers like
// Prism's static mock does, with no extra dependency. Any /users/{id} gets the
// 200 example; `Prefer: code=404` gets the 404 example instead.
const examples = {
  200: { id: 1, name: 'Ada Lovelace', role: 'admin' },
  404: { error: 'User not found.' },
};

require('http')
  .createServer((req, res) => {
    if (!/^\/users\/\d+$/.test(req.url)) {
      res.writeHead(404).end();
      return;
    }
    const code = /code=404/.test(req.headers.prefer || '') ? 404 : 200;
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(examples[code]));
  })
  .listen(4010, () => console.log('Mock API listening on port 4010'));
