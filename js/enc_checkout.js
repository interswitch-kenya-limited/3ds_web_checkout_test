// require('./songbird_v1.js');// Todo replace with node library import
// import $ from "jquery";

const baseUrl = "https://testmerchant.interswitch-ke.com";
let eresp = "";
let payload = "";
let successCallback;
let errorCallback;

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

function makeCardPayment(payload, onSuccess, onFailure) {
    successCallback = onSuccess;
    errorCallback = onFailure;
    fetch(baseUrl + "/merchant/card/encryptedIPGCheckout", {
        body: JSON.stringify(payload),
        credentials: 'same-origin',
        mode: 'cors',
        headers: {'Accept': 'application/json', 'Content-Type': 'application/json'},
        method: 'POST'
    })
        .then(response => {
            return response.json();
        }).then(response => {
        cardInitialize(response, successCallback, errorCallback);
        // successCallback(response);
    })
        .catch(error => {
            errorCallback(error);
        });
}

function cardInitialize(payloadParam, successCallback, errorCallback) {
    const ip = getIp();
    payload = payloadParam;
    // payload = JSON.parse(payload);
    if (payload.customerInfor) {
        let customerInforParts = payload.customerInfor.split('|');
        customerInforParts[10] = ip;
        customerInforParts[11] = window.location.hostname;
        customerInforParts[12] = getBrowserInfor();
        payload.customerInfor = customerInforParts.join('|');
    } else {
        payload.customerInfor = "| | | | | | | | | | |" + ip + '|' + window.location.hostname + ' |' + getBrowserInfor();
    }
    payload = JSON.stringify(payload);
    $.get(baseUrl + "/merchant/card/initialize", {requestStr: payload}, function (response) {
        if (response.jwt) {
            //validate account
            Cardinal.setup("init", {
                jwt: response.jwt
            });
        } else {
            console.count("card not enrolled");
            errorCallback(response);
        }
    }).fail(function () {
        errorCallback("error");
    });
}

function tokenInitialize(payloadParam, successCallback, errorCallback) {
    const ip = getIp();
    payload = payloadParam;
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
        } else {
            console.count("Token card not enrolled");
            errorCallback(response);
        }
    }).fail(function () {
        errorCallback("error", null, undefined);
    });
}

function paymentsCompleted(setupCompleteData) {
    Cardinal.trigger("bin.process", '1234567894561237');
    checkEnrollAction(payload, setupCompleteData.sessionId);
}

function paymentsValidated(data, jwt) {
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
            errorCallback(data);
            break;
        case "ERROR":
//            console.count("ERROR");
            // Handle service level error
            errorCallback(data);
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
            console.count("card not enrolled");
            errorCallback(response);
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
            console.count("validation succeeded");
            successCallback(response);
            notifyAction("Validate", "0", JSON.stringify(response), payload);
        } else {
            console.count("validation failed");
            errorCallback(response);
            notifyAction("Validate", "1", JSON.stringify(response), payload);
        }
    });
}

function authorizeAction(payload, eresp) {
    $.get(baseUrl + "/merchant/card/authorize1", {eresp: eresp, requestStr: payload}, function (response) {
        if (response.transactionRef) {
            console.count("Authorization succeeded");
            successCallback(eresp);
            notifyAction("Authorize", "0", JSON.stringify(response), payload);
        } else {
            console.count("Authorization failed");
            errorCallback(response);
            notifyAction("Authorize", "1", JSON.stringify(response), payload);
        }
    });
}

function notifyAction(transactionType, respStatus, resp, payload) {
    $.get(baseUrl + "/merchant/card/notify", {
        transactionType: transactionType,
        respStatus: respStatus,
        responseStr: resp,
        requestStr: payload
    }, function (response) {
        if (response.responseCode) {
            console.count("Notify succeeded");
        } else {
            console.count("Notify failed");
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