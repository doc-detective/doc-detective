const Koa = require('koa');
const serve = require('koa-static');
const send = require('koa-send');
const path = require('path');
const fs = require('fs');
const Router = require('@koa/router');

const app = new Koa();
const router = new Router();

app.use(serve(path.join(__dirname, 'frontend')));

router.get('/read-file', async (ctx) => {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'some-file.txt'), 'utf-8');
    ctx.body = data;
  } catch (err) {
    console.error('An error occurred reading the file:', err);
    ctx.status = 500;
  }
});

app.use(router.routes()).use(router.allowedMethods());

app.use(async (ctx) => {
  await send(ctx, 'index.html', { root: path.join(__dirname, '../frontend/build') });
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
