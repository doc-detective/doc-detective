
# What's Doc Detective?

In the current software development ecosystem, documentation needs regular revision and can rapidly become inaccurate. This back-and-forth of updating code and documentation can feel like an accelerating treadmill that prevents you from being as effective as possible.

Doc Detective simplifies keeping documentation up-do-date by running tests against a user interface to verify the accuracy of documentation. If there is a discrepancy between the interface and the expected results, Doc Detective can point out the specific error. Successfully implemented tests result in documentation that consistency matches the product and a means to proactively identify and fix issues that arise.

## What can Doc Detective do?
Doc Detective can do a lot, especially with a bit of creativity.

### Test documentation for accuracy/freshness
Doc Detective’s core strength is the ability to systematically check each and every element of your documentation for adherence to the reality of your product. Each of the following items can be inspected:

-   Existence of page elements    
-   Written text (such as a heading or a button string)
-   Screenshots
-   Links
-   API endpoints, functionality, and responses
-   Anything you can write a script to verify
    
### Generate screenshots or video to accompany documentation
When Doc Detective runs tests, it can take screenshots and make recordings. You can include this media in the documentation to compliment written processes, aiding the readers who prefer visual media while making sure your videos and images are up-to-date.

### Generate tests when updating documentation
After you write new documentation, Doc Detective can scan it and generate the necessary tests to verify its accuracy.

### Analyze the test coverage of your documentation and suggest solutions
Doc Detective ties specific tests to each line of your documentation. As a result, it can identify portions that are underserved and provide recommendations on next steps.

## What can’t Doc Detective do?
It’s important to know your limits, and Doc Detective’s too.

### Write your documentation
Doc Detective doesn’t scan your code or generate documentation. It verifies the accuracy of documentation by running tests against your product.

### Write your code
While Doc Detective can write tests from scanning your documentation, it can’t write code for you. Sorry.

## Who is Doc Detective for?
As an open-source and accessible project, Doc Detective is for anyone who is interested! More specifically, here are some groups who could benefit:

-   **Small teams:** There’s often limited personnel or budget dedicated to a project, and documentation takes a backseat as a result. With Doc Detective, you can spend less time reviewing published documentation and trust that it is still functional and accurate for the end user.
    
-   **Large teams:** The more people you have contributing to a project, the faster it can change shape. In cases where development is outpacing documentation, Doc Detective keeps a watchful eye on the changes made and note any inconsistencies.
    
-   **Anything in between:** You can be a team of one or of one thousand and still find a use for Doc Detective. When it comes time to address the documentation of your project, look to Doc Detective to ease the burden and help bring consistency and accuracyto the end user.

## Next steps
Want to take Doc Detective for a spin? Check out the [Get Started](https://github.com/doc-detective/doc-detective/docs/get-started.md) guide.

# Get started
Doc Detective is versatile, and you can deploy it in many ways to suit the requirements of your development environment. This guide covers the three most common deployment methods: NPM, CLI, and Docker.

## NPM
Doc Detective integrates with Node projects as an NPM package. When using the NPM package, you must specify all options in the test() method's config argument, which is a JSON object with the same structure as [config.json](https://github.com/doc-detective/doc-detective/blob/main/sample/config.json).

1.  In a terminal, navigate to your Node project then install Doc Detective:  
`npm i doc-detective`

2.  Add a reference to the package in your project:  
`const { test } = require("doc-detective");`

3.  Run tests with the test() method:  
`test(config);`

## CLI
You can run Doc Detective as a standalone CLI tool. When running as a CLI tool, you can specify default configuration options in [config.json](https://github.com/hawkeyexl/doc-detective/blob/master/sample/config.json) and override those defaults with command-line arguments. (For a list of arguments, complete the following steps and run npm run test -- -h.)

1.  Install prerequisites:
-   [Node.js](https://nodejs.org/)

3.  In a terminal, clone the repo and install dependencies:  
`git clone https://github.com/hawkeyexl/doc-detective.git`
`cd doc-detective`  
`npm install`

3.  Run tests according to your config. The -c argument is required and specifies the path to your config. The following example runs tests in the [sample/](https://github.com/hawkeyexl/doc-detective/tree/master/sample) directory:  
`npm run test -- -c sample/config.json`
 
To customize your test, file type, and directory options, update [sample/config.json](https://github.com/hawkeyexl/doc-detective/blob/master/sample/config.json).
