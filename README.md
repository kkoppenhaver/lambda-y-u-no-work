
Proof of concept for running [Lighthouse](https://github.com/GoogleChrome/lighthouse) performance benchmarking tests inside an AWS Lambda function.


**Run Locally:**  

```sh
cd mantle-lighthouse-lambda

npm install
// or
yarn install --ignore-engines

docker run --rm -v "$PWD":/var/task lambci/lambda:nodejs8.10 index.handler "$(cat ./testEvent_GET.json)"
```

<br/>

**Pack for Deployment:**

```sh
cd mantle-lighthouse-lambda

# single clean & package function
docker run --rm -v "$PWD":/var/task lambci/lambda:build-nodejs8.10 bash -c "rm -f kinja-lighthouse-lambda.zip && rm -rf node_modules && npm install && zip kinja-lighthouse-lambda.zip -r node_modules index.js package.json"

# ---

# Clean Up
docker run --rm -v "$PWD":/var/task lambci/lambda:build-nodejs8.10 bash -c "rm -f kinja-lighthouse-lambda.zip && rm -rf node_modules && npm install"

# Package
docker run --rm -v "$PWD":/var/task lambci/lambda:build-nodejs8.10 bash -c "rm -f *.zip && zip kinja-lighthouse-lambda.zip -r node_modules index.js package.json"
```


<br/>

*See the original [lighthouse-lambda](https://github.com/joytocode/lighthouse-lambda) repo that this was based on for more info*

