// Stand-in mock backend for the inline tests in mock-backend.mdx: answers like
// Prism would from an OpenAPI example, with no extra dependency.
const users = { 1: { id: 1, name: 'Ada Lovelace', role: 'admin' } };

require('http')
  .createServer((req, res) => {
    const match = req.url.match(/^\/users\/(\d+)$/);
    const user = match && users[match[1]];
    res.writeHead(user ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(user || { error: 'User not found.' }));
  })
  .listen(4010, () => console.log('Mock API listening on port 4010'));
