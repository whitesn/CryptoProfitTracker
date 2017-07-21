const {ipcRenderer} = require('electron');
const await = require('await');
const moment = require('moment');

var homeHTML, settingHTML;
var loadingHTML = "<i class=\"fa fa-spinner fa-spin fa-lg fa-fw\"></i>";
var balances = [], tickers = [];
var tableEntryCount = 0;

// Use await to only setupPortfolioPage when HTMLs are ready
var htmls = await('home', 'setting');

$.get("home.html", function(data) {
    homeHTML = data;
    htmls.keep( 'home', true );
});

$.get("setting.html", function(data) {
    settingHTML = data;
    htmls.keep( 'setting', true );
});

htmls.then(function(htmls) {
    setupPortfolioPage();
});
// -----------------------------------------------------------

$("#homeBtn").click(function() {
    setupPortfolioPage();
});

$("#settingBtn").click(function() {
    setupSettingPage();
});

function setupPortfolioPage() {

    function refreshSyncTime() {
        var timeLabel = "Last Sync: " + moment().format("hh:mm A");
        $(".cpt-last-sync").html( timeLabel );
    }

    function refreshBalances() {
        function createCoinEntry( balance ) {
            var coinName = balance.coin;
            var amt = balance.amount;
            var buyRate = balance.buy_rate;
            var entry = "";

            entry += "<td>" + coinName + "</td>";
            entry += "<td class='amt-" + coinName +"'>" + amt + "</td>";
            entry += "<td class='buy-rate-" + coinName + "'>" + buyRate + "</td>";
            entry += "<td class='cur-rate-" + coinName + "'></td>";
            entry += "<td class='profit-" + coinName + "'></td>";
            entry += "<td class='btc-conv-" + coinName + "' ></td>";

            return entry;
        }

        for( var i = 0; i < balances.length; i++ ) {
            var balance = balances[i];
            var coinName = balance.coin;
            var amt = balance.amount = parseFloat(balance.amount).toFixed(6);
            var buyRate;

            if( balance.buy_rate == null ) {
                buyRate = 0;
            } else {
                buyRate = balance.buy_rate = parseFloat(balance.buy_rate).toFixed(6);
            }

            if( balance.amount > 0 ) {
                if($(".coin-" + coinName).length == 0) {
                    // Insert entry <tr> to the HTML if does not exist yet
                    if( tableEntryCount++ % 2 == 0 ) {
                        $("#cpt-balances").append("<tr class='coin-" + coinName + "'></tr>");
                    } else {
                        $("#cpt-balances").append("<tr class=\"coin-" + coinName + " pure-table-odd\"></tr>");
                    }

                    // Insert the entry to the created TR
                    var entry = createCoinEntry( balance );
                    $(".coin-" + coinName).append(entry);
                    setTickerLoading( coinName );
                } else {
                    // Only update the HTML entries
                    $(".amt-" + coinName).html( amt );
                    $(".buy-rate-" + coinName).html( buyRate );
                }
            }
        }
    }

    function setBalanceLoading( coinName ) {
        $(".amt-" + coinName).html( loadingHTML );
        $(".buy-rate-" + coinName).html( loadingHTML );
    }

    function setBalancesLoading() {
        balances.forEach((balance) => {
            setBalanceLoading( balance.coin );
        });
    }

    function setTickerLoading( coinName ) {
        $(".cur-rate-" + coinName).html( loadingHTML );
        $(".profit-" + coinName).html( loadingHTML );
        $(".btc-conv-" + coinName).html( loadingHTML );
    }

    function setTickersLoading() {
        balances.forEach((balance) => {
            setTickerLoading( balance.coin );
        });
    }

    function allTickerFilled() {
        var allTickerFilled = true;

        balances.forEach((balance) => {
            if( balance.amount > 0 ) {
                var curRate = $(".cur-rate-" + balance.coin).html();
                if( isNaN(curRate) ) {
                    allTickerFilled = false;
                }
            }
        });

        return allTickerFilled;
    }

    function fillTicker( ticker ) {
        var coinName = ticker.Coin;
        var curRate = ticker.Last;
        var buyRate = $(".buy-rate-" + coinName).html();
        var amount = $(".amt-" + coinName).html();

        if( amount > 0 ) {
            var profit = (curRate - buyRate) / buyRate;
            var profitDisplay = (profit * 100).toFixed(2) + " %";
            if( profit < 0 ) {
                profitDisplay = "<label class=\"cpt-profit-negative\">" + profitDisplay + "</label>";
            } else {
                profitDisplay = "<label class=\"cpt-profit-positive\">" + profitDisplay + "</label>";
            }

            $(".cur-rate-" + coinName).html( curRate );
            $(".profit-" + coinName).html( profitDisplay );

            var conversion = amount * curRate;
            $(".btc-conv-" + coinName).html( conversion.toFixed(6) +
            " (<label class=\"btc-conv-rat-" + coinName + "\">" + loadingHTML + "</label>)" );

            if( allTickerFilled() ) {
                refreshConversion();
            }
        }
    }

    function refreshConversion() {
        var conversionTotal = 0;
        var conversions = {};

        balances.forEach((balance) => {
            if( balance.amount > 0 ) {
                var curRate = $(".cur-rate-" + balance.coin).html();
                var amount = $(".amt-" + balance.coin).html();
                var total = amount * curRate;
                conversions[balance.coin] = total;
                conversionTotal += total;
            }
        });

        balances.forEach((balance) => {
            if( balance.amount > 0 ) {
                var conversion = conversions[balance.coin];
                var html = ((conversion / conversionTotal) * 100).toFixed(2) + " %";
                $(".btc-conv-rat-" + balance.coin).html( html );
            }
        });
    }

    function initPortfolio() {
        $("#cpt-mainwindow").html( homeHTML );

        refreshBalances();

        $(".cpt-update").click(function() {
            setBalancesLoading();
            setTickersLoading();
            ipcRenderer.send('update_portfolio');
        });
    }

    function updateTicker() {
        ipcRenderer.send('update_ticker', balances);
    }

    // Balances stored from last fetch from the DB
    ipcRenderer.on('reply_balances', (event,arg) => {
        balances = arg;
        refreshBalances();
        updateTicker();
    });

    // Current Balance on Bittrex
    ipcRenderer.on('reply_update_portfolio', (event,arg) => {
        balances = arg;
        refreshBalances();
        updateTicker();
        refreshSyncTime();
    });

    // Current Ticker (Last Bid) on Bittrex
    ipcRenderer.on('reply_ticker', (event,arg) => {
        tickers.push( arg );
        fillTicker( arg );
    });

    // Set the HTML on Main Window,
    initPortfolio();
    ipcRenderer.send('update_portfolio');
}

function setupSettingPage() {
    var api_key, secret_key;

    function initSettingPage() {
        $("#cpt-mainwindow").html( settingHTML );

        $(".cpt-auth-submit").click(function() {
            api_key = $("#apikey").val();
            secret_key = $("#secret_key").val();

            const bittrex_auth = {
                'api_key': api_key,
                'secret_key': secret_key
            };

            ipcRenderer.send('bittrex_auth_add', bittrex_auth);
        });
    }

    ipcRenderer.on('reply_api', (event,arg) => {
        $("#apikey").val( arg.api_key );
        $("#secret_key").val( arg.secret_key );
    });

    initSettingPage();
    ipcRenderer.send('request_api');
}
