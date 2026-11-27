<!-- test {"testId":"http-checkfile","detectSteps":true} -->

# Check a build report

Write the build report to the `output` folder next to this page:

```shell
node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/report.txt','build 7 passed')"
```

<!-- step {"runShell":{"command":"node -e \"const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/report.txt','build 7 passed')\"","workingDirectory":"."}} -->

Check that the `output` folder holds a text file.

<!-- step {"checkFile":"output/*.txt"} -->

Check that the report says the build passed.

<!-- step {"checkFile":{"path":"output/report.txt","content":"/build [0-9]+ passed/","timeout":10000}} -->

<!-- test end -->
