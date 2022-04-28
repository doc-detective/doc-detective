const puppeteer = require("puppeteer");
const { PuppeteerScreenRecorder } = require("puppeteer-screen-recorder");

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
  });
  const page = await browser.newPage();
  const recorder = new PuppeteerScreenRecorder(page);
  await recorder.start("./demo.mp4");
  await page.goto("https://www.google.com");
  await page.screenshot({ path: "1.png" });
  await page.goto("https://www.bing.com");
  await page.screenshot({ path: "2.png" });
  await recorder.stop();
  await browser.close();
})();
