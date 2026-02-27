const { validate, schemas } = require("../src/index");

const object = {
  tests: [
    {
      steps: [
        {
          goTo: {
            url: "http://localhost:8092",
            waitUntil: {
              find: {
                selector: "button",
                elementText: "Standard Button",
                elementTestId: "standard-btn",
                elementAria: "Sample Standard Button",
                elementId: "standard-btn",
                elementClass: ["btn"],
                elementAttribute: {
                  type: "button",
                  value: "Standard Button",
                },
              },
            },
          },
        },
      ],
    },
  ],
};

console.log(validate({ schemaKey: "spec_v3", object }));
