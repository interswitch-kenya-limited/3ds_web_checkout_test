// require('./songbird_v1.js');// Todo replace with node library import
// import $ from "jquery";

const baseUrl = "http://localhost:7784";
let eresp = "";
let payload = "";
let callback;

function getIp() {
    let ip = "";
    jQuery.ajax({
        url: 'https://jsonip.com',
        success: function (data) {
            ip = data.ip;
        },
        async: false
    });
    return ip;
}

//configure cardinal
Cardinal.configure({
    logging: {
        level: "on"
    }
});

Cardinal.on('payments.setupComplete', paymentsCompleted);
Cardinal.on("payments.validated", paymentsValidated);

function makeCardPayment(payload, successCallback, errorCallback) {
    $.post(baseUrl + "/merchant/card/encryptedinitialize", payload, function (response) {
        console.log(response);
    }).fail(t => errorCallback(t)).then(r => {
        console.log(r)
    });
}

function cardInitialize(payloadParam, callbackParam) {
    const ip = getIp();
    payload = payloadParam;
    callback = callbackParam;
    payload = JSON.parse(payload);
    if (payload.customerInfor) {
        if (payload.customerInfor.split('|').length === 10) {
            payload.customerInfor = payload.customerInfor + '|' + ip + '|' + window.location.hostname + ' |' + getBrowserInfor();
        } else {
            payload.customerInfor = "| | | | | | | | | | |" + ip + '|' + window.location.hostname + ' |' + getBrowserInfor();
        }
    } else {
        payload.customerInfor = "| | | | | | | | | | |" + ip + '|' + window.location.hostname + ' |' + getBrowserInfor();
    }
    payload = JSON.stringify(payload);
    //    console.count("cardInitialize(payload): " + payload);
    $.get(baseUrl + "/merchant/card/initialize", {requestStr: payload}, function (response) {
        if (response.jwt) {

            //validate account
            Cardinal.setup("init", {
                jwt: response.jwt
            });

//            console.count("/merchant/card/initialize response:", JSON.stringify(response));
        } else {
            console.count("card not enrolled");
            callback(response, null, undefined);
        }
    }).done(function () {
        // callback("second success", null, undefined);
    }).fail(function () {
        callback("error", null, undefined);
    }).always(function () {
        // callback("finished", null, undefined);
    });
}

function tokenInitialize(payloadParam, callbackParam) {
    const ip = getIp();
    payload = payloadParam;
    callback = callbackParam;
    payload = JSON.parse(payload);
    if (payload.customerInfor) {
        if (payload.customerInfor.split('|').length === 10) {
            payload.customerInfor = payload.customerInfor + '|' + ip + '|' + window.location.hostname + ' |' + getBrowserInfor();
        } else {
            payload.customerInfor = "| | | | | | | | | | |" + ip + '|' + window.location.hostname + ' |' + getBrowserInfor();
        }
    } else {
        payload.customerInfor = "| | | | | | | | | | |" + ip + '|' + window.location.hostname + ' |' + getBrowserInfor();
    }
    payload = JSON.stringify(payload);
    //    console.count("cardInitialize(payload): " + payload);
    $.get(baseUrl + "/merchant/token/initialize", {requestStr: payload}, function (response) {
        if (response.jwt) {

            //validate account
            Cardinal.setup("init", {
                jwt: response.jwt
            });
            payload = JSON.stringify(response);
//            console.count("Response and new payload" + payload);
        } else {
            console.count("Token card not enrolled");
            callback(response, null, undefined);
        }
    }).done(function () {
        // callback("second success", null, undefined);
    }).fail(function () {
        callback("error", null, undefined);
    }).always(function () {
        // callback("finished", null, undefined);
    });
}

function paymentsCompleted(setupCompleteData) {
//    console.count("payments.setupComplete", setupCompleteData.sessionId);
    Cardinal.trigger("bin.process", '1234567894561237');
    checkEnrollAction(payload, setupCompleteData.sessionId);
}

function paymentsValidated(data, jwt) {
//    console.count('payments.validated', jwt);
//    console.count('eresp: ' + eresp);
//    console.count(JSON.stringify(data));
//    console.log("Data action code:", data.ActionCode);
    validateAction(payload, eresp, JSON.stringify(data), JSON.stringify(jwt));
    switch (data.ActionCode) {
        case "SUCCESS":
//            console.count('success');
            validateAction(payload, eresp, JSON.stringify(data), JSON.stringify(jwt));
            // Handle successful transaction, send JWT to backend to verify
            break;
        case "NOACTION":
//            console.count("NOACTION");
            // Handle no actionable outcome
            break;
        case "FAILURE":
//            console.count("FAILURE");
            // Handle failed transaction attempt
            callback(data);
            break;
        case "ERROR":
//            console.count("ERROR");
            // Handle service level error
            callback(data);
            break;
    }
}

function checkEnrollAction(payload, referenceId) {
    $.get(baseUrl + "/merchant/card/enrolled1", {referenceId: referenceId, requestStr: payload}, function (response) {
        //document.getElementById("eresp").innerHTML = JSON.stringify(response);
        eresp = JSON.stringify(response);
        if (response.transactionRef) {
//            console.count(JSON.stringify(response));
            if (response.csAcsURL) {
                Cardinal.continue('cca',
                    {
                        "AcsUrl": response.csAcsURL,
                        "Payload": response.csPaReq
                    },
                    {
                        "OrderDetails": {
                            "TransactionId": response.csAuthenticationTransactionID
                        }
                    },
                    response.jwt
                );
//                console.count("continue initiated");
            } else {
                //var eresp = document.getElementById("eresp").innerHTML;
                authorizeAction(payload, eresp);
            }
        } else {
//            console.count(JSON.stringify(response));
//            console.count("card not enrolled");
            notifyAction("Check", "1", JSON.stringify(response), payload);
        }
    });
}

function validateAction(payload, eresp, data, jwt) {
    $.get(baseUrl + "/merchant/card/validated1", {
        eresp: eresp,
        data: data,
        jwt: jwt,
        requestStr: payload
    }, function (response) {
//        console.count("Validation response", JSON.stringify(response));
        if (response.transactionRef) {
//            console.count("validation succeeded");
            notifyAction("Validate", "0", JSON.stringify(response), payload);
        } else {
//            console.count("validation failed");
            notifyAction("Validate", "1", JSON.stringify(response), payload);
        }
    });
}

function authorizeAction(payload, eresp) {
    $.get(baseUrl + "/merchant/card/authorize1", {eresp: eresp, requestStr: payload}, function (response) {
        if (response.transactionRef) {
//            console.count(JSON.stringify(response));
//            console.count("Successfully authorized" + response);
            callback(null, eresp, null);
            notifyAction("Authorize", "0", JSON.stringify(response), payload);
        } else {
//            console.count(JSON.stringify(response));
//            console.count("Authorization failed");
            notifyAction("Authorize", "1", JSON.stringify(response), payload);
            callback(response, null, undefined);
        }
    });
}

function notifyAction(transactionType, respStatus, resp, payload) {
//    console.log("Notifying outcome for " + transactionType + ", result status: " + respStatus + " response: " + resp);
    if (respStatus === "0") {
//        console.count("Notify succeeded");
        callback(null, resp, null);
    } else {
        callback(resp);
    }
    $.get(baseUrl + "/merchant/card/notify", {
        transactionType: transactionType,
        respStatus: respStatus,
        responseStr: resp,
        requestStr: payload
    }, function (response) {
//        console.count("Notify response", JSON.stringify(response));
        if (response.responseCode) {
//            console.count("Notify succeeded");
        } else {
//            console.count("Notify failed");
        }
    });
}

function getBrowserInfor() {
    const nAgt = navigator.userAgent;
    let browserName = navigator.appName;
    let fullVersion = '' + parseFloat(navigator.appVersion);
    let majorVersion = parseInt(navigator.appVersion, 10);
    let nameOffset, verOffset, ix;
    // In Opera 15+, the true version is after "OPR/"
    if ((verOffset = nAgt.indexOf("OPR/")) !== -1) {
        browserName = "Opera";
        fullVersion = nAgt.substring(verOffset + 4);
    }
    // In older Opera, the true version is after "Opera" or after "Version"
    else if ((verOffset = nAgt.indexOf("Opera")) !== -1) {
        browserName = "Opera";
        fullVersion = nAgt.substring(verOffset + 6);
        if ((verOffset = nAgt.indexOf("Version")) !== -1)
            fullVersion = nAgt.substring(verOffset + 8);
    }
    // In MSIE, the true version is after "MSIE" in userAgent
    else if ((verOffset = nAgt.indexOf("MSIE")) !== -1) {
        browserName = "Microsoft Internet Explorer";
        fullVersion = nAgt.substring(verOffset + 5);
    }
    // In Chrome, the true version is after "Chrome"
    else if ((verOffset = nAgt.indexOf("Chrome")) !== -1) {
        browserName = "Chrome";
        fullVersion = nAgt.substring(verOffset + 7);
    }
    // In Safari, the true version is after "Safari" or after "Version"
    else if ((verOffset = nAgt.indexOf("Safari")) !== -1) {
        browserName = "Safari";
        fullVersion = nAgt.substring(verOffset + 7);
        if ((verOffset = nAgt.indexOf("Version")) !== -1)
            fullVersion = nAgt.substring(verOffset + 8);
    }
    // In Firefox, the true version is after "Firefox"
    else if ((verOffset = nAgt.indexOf("Firefox")) !== -1) {
        browserName = "Firefox";
        fullVersion = nAgt.substring(verOffset + 8);
    }
    // In most other browsers, "name/version" is at the end of userAgent
    else if ((nameOffset = nAgt.lastIndexOf(' ') + 1) <
        (verOffset = nAgt.lastIndexOf('/'))) {
        browserName = nAgt.substring(nameOffset, verOffset);
        fullVersion = nAgt.substring(verOffset + 1);
        if (browserName.toLowerCase() === browserName.toLowerCase()) {
            browserName = navigator.appName;
        }
    }
    // trim the fullVersion string at semicolon/space if present
    if ((ix = fullVersion.indexOf(";")) !== -1)
        fullVersion = fullVersion.substring(0, ix);
    if ((ix = fullVersion.indexOf(" ")) !== -1)
        fullVersion = fullVersion.substring(0, ix);

    majorVersion = parseInt('' + fullVersion, 10);
    if (isNaN(majorVersion)) {
        fullVersion = '' + parseFloat(navigator.appVersion);
        majorVersion = parseInt(navigator.appVersion, 10);
    }
    return browserName
}