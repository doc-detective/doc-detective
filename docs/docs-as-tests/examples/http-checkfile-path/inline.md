<!-- test {"testId":"http-checkfile-path","detectSteps":false} -->

# Check for any log file

Write a log to the `output` folder next to this page:

```shell
node -e "const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/app.log','started')"
```

<!-- step {"runShell":{"command":"node -e \"const fs=require('fs');fs.mkdirSync('output',{recursive:true});fs.writeFileSync('output/app.log','started')\"","workingDirectory":"."}} -->

Check that the `output` folder holds a log file.

<!-- step {"checkFile":{"path":"output/*.log"}} -->

<!-- test end -->
