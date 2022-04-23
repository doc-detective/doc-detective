#!/usr/bin/env node

const {Builder, By, Key, until} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const nReadlines = require('n-readlines');
const config = require('./config.json');

async function testReadLines(file) {
    let inputFile = new nReadlines(file);
    let line;
    let lineNumber = 1;

    while (line = inputFile.next()) {
        console.log(`Line ${lineNumber} has: ${line.toString('ascii')}`);
        lineNumber++;
    }

    console.log('end of file.');
};

async function testSelenium() {
    let options = new chrome.Options();
    let driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
    try {
        await driver.get('http://www.google.com/ncr');
        await driver
            .findElement(By.name('q'))
            .sendKeys('webdriver', Key.RETURN);
        await driver.wait(until.titleIs('webdriver - Google Search'), 1000);
    } finally {
        await driver.quit();
    }
};

testReadLines("./temp/test.md");