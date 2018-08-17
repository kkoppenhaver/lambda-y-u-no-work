const lighthouse = require('lighthouse-lambda');
const datadogApi = require('dogapi');
const URL = require('url');

const timeoutLength = 300000; // in ms, currently 5 minutes
//const timeoutLength = 150000; // in ms, currently 3 minutes

const options = {onlyCategories: ['performance']};
const dataDogApiKey = '139ba2a32b1934ff3d6b796144ba7f11';
const dataDogAppKey = 'f2f0a1e5cec259b992e31277dab63fc975c20d09';


exports.handler= function (event, context, callback){
    let urlToTest;
    switch (event.httpMethod) {
        case 'GET':
            urlToTest = event.queryStringParameters.url;
            altPerfTest(urlToTest);

            callback(null);
            break;
        case 'POST':
            // Handling input from future A/B testing tool
            console.log("Received a POST. This feature isn't supported yet");
            callback('used post');
            break;
    }

    // console.log('Running Lighthouse performance audit on ' + urlToTest);

    function altPerfTest(url) {
        console.log('in altPerfTest()');
        datadogApi.initialize({
            api_key: dataDogApiKey,
            app_key: dataDogAppKey
        });
        runTestOn(url).then(()=>{
           console.log("all done");
            callback(null);
        });
    }

    // multivariantLighthousePerformanceTesting(urlToTest)
    //     .then(() => { callback(null) })
    //     .catch(callback(null));



    /**
     * A process which takes a base URL and runs tests on different versions via appending different query params.
     * Currently it tests:
     *  - as provided
     *  - ?adzone=kinjatest  sets ads to fill with static testing creative
     *  - ?no3rdparty        removes thirdparty tracking or ad scripts
     * @param {string} baseURL - a URL to derive the various test URLs from.
     * @returns {Promise} Promise object that represents the disposition of the provided URL based on all the testing of it's variants.
     */
    function runTestOn(baseURL) {
        console.log('in runTestOn()');
        let testResult = new Promise((resolve,reject) => {
            let tests = [];
            let testPaths = [
                baseURL,
                baseURL + '?adzone=kinjatest',
                baseURL + '?no3rdparty'
            ];

            testPaths.forEach((testURL) => {
                tests.push(testAndLog(testURL));
            });

            //let variantTestResolutions = Promise.all(tests).then((statusOfTests) => {
            return Promise.all(tests).then((statusOfTests) => {
                statusOfTests.forEach(status => {
                    if (status === false) {
                        reject(new Error('statusOfTests contained a status that returned false'));
                    } else {
                        resolve();
                    }
                });
            }).catch((err) => { reject(err); });

            //return variantTestResolutions;
        });

        return testResult;
    }


    /**
     * Uses launchChromeAndRunLighthouse() to collect performance data and log it to DataDog
     * @param {string} url - URL to retrieve and print performance data about.
     * @returns {Promise} Promise object indicating if the specified performance data has been retrieved and set to DataDog Successfully.
     */
    function testAndLog(url) {
        console.log('in testAndLog()');
        return lighthouse(url, options)
            .then(({ chrome,log,start }) => {
                console.log('in lighthouse.then()');
                return start()
                    .then((results) => {
                        console.log('Received results for ' + url +', now logging it with DataDog.');
                        logResults(results.lhr);
                        //return chrome.kill().then(() => callback(null));
                        return chrome.kill().then(() => Promise.resolve());
                    })
                    .catch((error) => {
                        console.log('looks like an error occurred');
                        console.log(error);
                        console.log('current location: testAndLog > lighthouse.then( start.catch( ✱ ))');

                        //return chrome.kill().then(() => callback(error))
                        return chrome.kill().then(() => Promise.reject(error));
                    })
            }).catch((error) => {
                console.log('looks like an error occurred');
                console.log(error);
                console.log('current location: testAndLog > lighthouse.catch( ✱ )');


                //return chrome.kill().then(() => callback(error))
                return chrome.kill().then(() => Promise.reject(error));
            });

        function logResults(resultValues) {
            if (resultValues.requestedUrl !== resultValues.finalUrl) {
                console.log(resultValues.requestedUrl);
                console.log('Woah there...looks like a redirct or something funky happened.');
                console.log('We wanted to find ' + resultValues.requestedUrl + ' but ended up at ' + resultValues.finalUrl);
                console.log('current location: testAndLog > logResults(){  ✱  }');
                return false;
            } else {
                const urlObj = URL.parse(url);
                let firstMeaningfulPaintValue = Math.floor(resultValues.audits['first-meaningful-paint'].rawValue);
                let totalByteWeightValue = Math.floor(resultValues.audits['total-byte-weight'].displayValue[1]);
                let domNodesValue = Math.floor(resultValues.audits['dom-size'].rawValue);
                /* -- available values on results.audits
                 'first-contentful-paint'
                 'first-meaningful-paint'
                 'speed-index'
                 'screenshot-thumbnails'
                 'estimated-input-latency'
                 'time-to-first-byte'
                 'first-cpu-idle'
                 'interactive'
                 'user-timings'
                 'critical-request-chains'
                 'redirects'
                 'mainthread-work-breakdown'
                 'bootup-time'
                 'uses-rel-preload'
                 'uses-rel-preconnect'
                 'font-display'
                 'network-requests'
                 'metrics'
                 'uses-long-cache-ttl'
                 'total-byte-weight'
                 'offscreen-images'
                 'render-blocking-resources'
                 'unminified-css'
                 'unminified-javascript'
                 'unused-css-rules'
                 'uses-webp-images'
                 'uses-optimized-images'
                 'uses-text-compression'
                 'uses-responsive-images'
                 'efficient-animated-content'
                 'dom-size'
                 */
                let metricsToBeLogged = [
                    sendMetric('firstMeaningfulPaint', firstMeaningfulPaintValue), // First Meaningful Paint
                    sendMetric('totalByteWeight', totalByteWeightValue), // Total Byte
                    sendMetric('DOMnodes',domNodesValue) // # of DOM Nodes
                ];

                return Promise.all(metricsToBeLogged);


                function sendMetric(metricName, value) {
                    let fullMetricName = '';
                    fullMetricName += 'mantle.lighthouse.';
                    fullMetricName += urlObj.href
                        .replace(/http[s]:\/\//,'')
                        .replace(/\./g,'_')
                        .replace(/\//g,'')
                        .replace(/=/g,'-')
                        .replace(/\?/g, '_');
                    fullMetricName += '.';
                    fullMetricName += metricName;

                     // //-- local debugging/testing
                     //    console.log(fullMetricName + ': ' + value);
                     //    return Promise.resolve();

                    let sendMetricPromise = new Promise((resolve,reject) => {
                        datadogApi.metric.send(fullMetricName, value, function (err, results) {
                            if (err) {
                                console.log('error in datadogApi.metric.send(' + fullMetricName + ',' + value + ')');
                                console.log(results);
                                reject(new Error('error in sendMetricPromise > '+ fullMetricName));
                            } else {
                                resolve();
                            }
                        })
                    });
                    return sendMetricPromise

                }

            }
        }
    }



    /**
     * Pairs the variant tests with a timeout into a single controller function
     * @param {string} url - URL to test
     * @returns {Promise} Promise object indicating that the tests have completed & reported successfully or timed out
     */
    function multivariantLighthousePerformanceTesting(url) {
        console.log('in multivalentLighthousePerformanceTesting()');
        datadogApi.initialize({
            api_key: dataDogApiKey,
            app_key: dataDogAppKey
        });

        const taskTimeout = new Promise((resolve,reject) => {
            setTimeout(() => reject('Lighthouse performance audit timed out after ' + timeoutLength + 'ms'), timeoutLength);
        });

        return Promise.race([
            runTestOn(url),
            taskTimeout
        ]).then(() => {
            console.log('Lighthouse performance audit completed successfully.');
            console.log('See results on DataDog at https://app.datadoghq.com/screen/392391/lighthouse-perf-tests');
            callback(null);
            //process.exit();
        }).catch((e) => {
            if (e) {console.log(e);}
            console.log('an error occurred during Lighthouse performance audit');
            callback(e);
            //process.exit(1);  // Non-zero error code signals failure.
        });
    }


}

/**
 *
 * Console logging proof-of-concept
 *
 */
exports.handlerPOC = function (event, context, callback) {
  Promise.resolve()
    .then(() => {
        //lighthouse(urlBeingTested, options)
        return testLighthouse(urlBeingTested,options)
    })
    .then(({ chrome, start }) => {
      return start()
        .then((results) => {
            // use results.lhr for the JS-consumeable output
            // https://github.com/GoogleChrome/lighthouse/blob/master/typings/lhr.d.ts
            // use results.report for the HTML/JSON/CSV output as a string
            // use results.artifacts for the trace/screenshots/other specific case you need (rarer)

            let testResults = results.lhr.audits;
            let obj = {};
            obj.url = urlBeingTested;
            obj.firstMeaningfulPaint = Math.floor(testResults['first-meaningful-paint'].rawValue);
            obj.firstContentfulPaint = Math.floor(testResults['first-contentful-paint'].rawValue);
            obj.totalByteWeightValue = Math.floor(testResults['total-byte-weight'].displayValue[1]);
            obj.domNodesValue = Math.floor(testResults['dom-size'].rawValue);

            console.log(' ~ Results for ' + obj.url + ' ~ ');
            console.log('ms to First Meaningful Paint - ' + obj.firstMeaningfulPaint);
            console.log('ms to First Contentful Paint - ' + obj.firstContentfulPaint);
            console.log('Total Page Weight - ' + obj.totalByteWeightValue);
            console.log('# of DOM nodes - ' + obj.domNodesValue);

          return chrome.kill().then(() => callback())

        })
        .catch((error) => {
          // Handle errors when running Lighthouse
          console.log('looks like an error occurred');

          return chrome.kill().then(() => callback(error))
        })
    })
    // Handle other errors
    .catch(callback)



    function testLighthouse(urlBeingTested, options) {
        return lighthouse(urlBeingTested, options)
    }




}