'use strict';

(function(){
  angular
    .module('copayApp.controllers')
    .controller('tabCashshuffleController', tabCashshuffleController);

  function tabCashshuffleController(
    bitcoinCashJsService
    , bwcError
    , clipboardService
    , configService
    , gettextCatalog
    , $interval
    , $ionicHistory
    , $ionicModal
    , $ionicNavBarDelegate
    , $ionicPopover
    , lodash
    , $log
    , platformInfo
    , popupService
    , profileService
    , $rootScope
    , $scope
    , sendFlowService
    , soundService
    , $state 
    , storageService
    , $timeout
    , txFormatService
    , walletAddressListenerService
    , walletService
    , $ionicScrollDelegate
    , $filter
    , $stateParams
    , txpModalService
    , externalLinkService
    , addressbookService
    , $window
    , timeService
    , feeService
    , appConfigService
    , rateService
    , walletHistoryService
  ) {

    var DISPLAY_PAGE_SIZE = 15;
    var currentTxHistoryDisplayPage = 0;
    var completeTxHistory = []
    var listeners = [];
    var bchAddresses = {};

    // For gradual migration for doing it properly
    $scope.vm = {
      allowInfiniteScroll: false,
      gettingCachedHistory: true,
      gettingInitialHistory: true,
      updatingTxHistory: false,
      fetchedAllTxHistory: false,
      updateTxHistoryFailed: false,
  
      getSatoshiDiceIconUrl: getSatoshiDiceIconUrl,
      openWalletSettings: openWalletSettings
    };
  
    // Need flag for when to allow infinite scroll at bottom
    // - ie not when loading initial data and there is no more cached data
  
    $scope.amountIsCollapsible = false;
    $scope.color = '#888888';
    
    $scope.filteredTxHistory = [];
    $scope.isCordova = platformInfo.isCordova;
    $scope.isAndroid = platformInfo.isAndroid;
    $scope.isIOS = platformInfo.isIOS;
    $scope.isSearching = false;
    $scope.openTxpModal = txpModalService.open;
    $scope.requiresMultipleSignatures = false;
    $scope.showBalanceButton = false;
    $scope.status = null;
    // Displaying 50 transactions when entering the screen takes a while, so only display a subset
    // of everything we have, not the complete history.
    $scope.txHistory = [];                 // This is what is displayed
    $scope.txHistorySearchResults = [];
    $scope.txps = [];
    $scope.updatingStatus = false;
    $scope.updateStatusError = null;
    $scope.updatingTxHistoryProgress = 0;
    $scope.wallet = null;
    $scope.walletId = '';
    $scope.walletNotRegistered = false;
    $scope.bchAddressType = { type: 'cashaddr' };

    
    $scope.isCordova = platformInfo.isCordova;
    $scope.isNW = platformInfo.isNW;

    var channel = "ga";
    if (platformInfo.isCordova) {
      channel = "firebase";
    }
    var log = new window.BitAnalytics.LogEvent("cashshuffle_details", [{}, {}, {}], [channel, 'leanplum']);
    window.BitAnalytics.LogEventHandlers.postEvent(log);

    $scope.openExternalLink = function(url, target) {
      externalLinkService.open(url, target);
    };

    var setPendingTxps = function(txps) {
      if (!txps) {
        $scope.txps = [];
        return;
      }
      $scope.txps = lodash.sortBy(txps, 'createdOn').reverse();
    };

    var analyzeUtxosDone;

    var analyzeUtxos = function() {
      if (analyzeUtxosDone) return;
  
      feeService.getFeeLevels($scope.wallet.coin, function(err, levels) {
        if (err) return;
        walletService.getLowUtxos($scope.wallet, levels, function(err, resp) {
          if (err || !resp) return;
          analyzeUtxosDone = true;
          $scope.lowUtxosWarning = resp.warning;
        });
      });
    };

    var updateStatus = function(force) {
      $scope.updatingStatus = true;
      $scope.updateStatusError = null;
      $scope.walletNotRegistered = false;
      $scope.vm.fetchedAllTxHistory = false;
  
      walletService.getStatus($scope.wallet, {
        force: !!force,
      }, function(err, status) {
        $scope.updatingStatus = false;
        if (err) {
          if (err === 'WALLET_NOT_REGISTERED') {
            $scope.walletNotRegistered = true;
          } else {
            $scope.updateStatusError = bwcError.msg(err, gettextCatalog.getString('Could not update wallet'));
          }
          $scope.status = null;
        } else {
          setPendingTxps(status.pendingTxps);
          if (!$scope.status || status.balance.totalAmount != $scope.status.balance.totalAmount) {
              $scope.status = status;
          }
        }
  
        $timeout(function() {
          $scope.$apply();
        });
  
        analyzeUtxos();
  
      });
    };
    
    function openWalletSettings() {
      $state.go('tabs.preferences', {'walletId': $scope.wallet.id, 'backToDetails': false});
    }
  
    $scope.openSearchModal = function() {
      $scope.color = $scope.wallet.color;
      $scope.isSearching = true;
      $scope.txHistorySearchResults = [];
      $scope.filteredTxHistory = [];
  
      $ionicModal.fromTemplateUrl('views/modals/search.html', {
        scope: $scope,
        focusFirstInput: true
      }).then(function(modal) {
        $scope.searchModal = modal;
        $scope.searchModal.show();
      });
  
      $scope.close = function() {
        $scope.isSearching = false;
        $scope.searchModal.hide();
      };
  
      $scope.openTx = function(tx) {
        $ionicHistory.nextViewOptions({
          disableAnimate: true
        });
        $scope.close();
        $scope.openTxModal(tx);
      };
    };

    $scope.openTxModal = function(btx) {
      $scope.btx = lodash.cloneDeep(btx);
      $scope.walletId = $scope.wallet.id;
      $state.transitionTo('tabs.wallet.tx-details', {
        txid: $scope.btx.txid,
        walletId: $scope.walletId
      });
    };
  
    $scope.recreate = function() {
      walletService.recreate($scope.wallet, function(err) {
        if (err) return;
        $timeout(function() {
          walletService.startScan($scope.wallet, function() {
            $scope.updateAll(true, true);
            $scope.$apply();
          });
        });
      });
    };

    function applyCurrencyAliases(txHistory) {
      var defaults = configService.getDefaults();
      var configCache = configService.getSync();
  
      lodash.each(txHistory, function onTx(tx) {
        tx.amountUnitStr = $scope.wallet.coin == 'btc'
                          ? (configCache.bitcoinAlias || defaults.bitcoinAlias)
                          : (configCache.bitcoinCashAlias || defaults.bitcoinCashAlias);
  
        tx.amountUnitStr = tx.amountUnitStr.toUpperCase();
      });
    }
  
    function formatTxHistoryForDisplay(txHistory) {
      applyCurrencyAliases(txHistory);
  
      var config = configService.getSync();
      var fiatCode = config.wallet.settings.alternativeIsoCode;
      lodash.each(txHistory, function(t) {
        var r = rateService.toFiat(t.amount, fiatCode, $scope.wallet.coin);
        t.alternativeAmountStr = r.toFixed(2) + ' ' + fiatCode;
      });
    }

    function updateTxHistoryFromCachedData() {
      $scope.vm.gettingCachedHistory = true;
      console.log($scope.wallet)
      walletHistoryService.getCachedTxHistory($scope.wallet.id, function onGetCachedTxHistory(err, txHistory){
        $scope.vm.gettingCachedHistory = false;
        if (err) {
          // Don't display an error because we are also requesting the history.
          $log.error('Error getting cached tx history.', err);
          return;
        }
  
        if (!txHistory) {
          $log.debug('No cached tx history.');
          return;
        }
  
        formatTxHistoryForDisplay(txHistory);
  
        completeTxHistory = txHistory;
        showHistory(false);
        $scope.$apply();
      });
    }
  
    function fetchAndShowTxHistory(getLatest, flushCacheOnNew) {
      $scope.vm.updatingTxHistory = true;
  
      walletHistoryService.updateLocalTxHistoryByPage($scope.wallet, getLatest, flushCacheOnNew, function onUpdateLocalTxHistoryByPage(err, txHistory, fetchedAllTransactions) {
        $scope.vm.gettingInitialHistory = false;
        $scope.vm.updatingTxHistory = false;
        $scope.$broadcast('scroll.infiniteScrollComplete');
  
        if (err) {
          $log.error('pagination Failed to get history.', err);
          $scope.vm.updateTxHistoryFailed = true;
          return;
        }
  
        if (fetchedAllTransactions) {
          $scope.vm.fetchedAllTxHistory = true;
        }
  
        formatTxHistoryForDisplay(txHistory);
  
        completeTxHistory = txHistory;
        showHistory(true);
        $scope.$apply();
      });
    }
  
    
    function showHistory(showAll) {
      if (completeTxHistory) {
        $scope.txHistory = showAll ? completeTxHistory : completeTxHistory.slice(0, (currentTxHistoryDisplayPage + 1) * DISPLAY_PAGE_SIZE);
        $scope.vm.allowInfiniteScroll = !$scope.vm.fetchedAllTxHistory && !(completeTxHistory.length === $scope.txHistory.length && $scope.vm.gettingInitialHistory);
      } else {
        $scope.vm.allowInfiniteScroll = false;
      }
    }
    
  
    $scope.getDate = function(txCreated) {
      var date = new Date(txCreated * 1000);
      return date;
    };
  
    $scope.isFirstInGroup = function(index) {
      if (index === 0) {
        return true;
      }
      var curTx = $scope.txHistory[index];
      var prevTx = $scope.txHistory[index - 1];
      return !$scope.createdDuringSameMonth(curTx, prevTx);
    };
  
    $scope.isLastInGroup = function(index) {
      if (index === $scope.txHistory.length - 1) {
        return true;
      }
      return $scope.isFirstInGroup(index + 1);
    };
  
    $scope.createdDuringSameMonth = function(curTx, prevTx) {
      return timeService.withinSameMonth(curTx.time * 1000, prevTx.time * 1000);
    };
  
    $scope.createdWithinPastDay = function(time) {
      return timeService.withinPastDay(time);
    };
  
    $scope.isDateInCurrentMonth = function(date) {
      return timeService.isDateInCurrentMonth(date);
    };
  
    $scope.isUnconfirmed = function(tx) {
      return !tx.confirmations || tx.confirmations === 0;
    };
  
    // on-infinite="showMore()"
    $scope.showMore = function() {
      // Check if we have more than we are displaying
      if (completeTxHistory.length > $scope.txHistory.length) {
        currentTxHistoryDisplayPage++;
        showHistory(false);
        $scope.$broadcast('scroll.infiniteScrollComplete');
        return;
      }
  
      if ($scope.vm.updatingTxHistory) {
        return;
      }
  
      fetchAndShowTxHistory(false, false);
    };
  
    // on-refresh="onRefresh()"
    $scope.onRefresh = function() {
      $timeout(function() {
        $scope.$broadcast('scroll.refreshComplete');
      }, 300);
      $scope.updateAll(true, false);
    };

    $scope.updateAll = function(forceStatusUpdate, flushTxCacheOnNew)  {
      updateStatus(forceStatusUpdate);
      //updateTxHistory(cb);
      fetchAndShowTxHistory(true, flushTxCacheOnNew);
    };
  
    $scope.hideToggle = function() {
      profileService.toggleHideBalanceFlag($scope.wallet.credentials.walletId, function(err) {
        if (err) $log.error(err);
      });
    };
  
    var prevPos;
    $scope.txHistoryPaddingBottom = 0;
    function getScrollPosition() {
      var scrollPosition = $ionicScrollDelegate.getScrollPosition();
  
      $timeout(function() {
        getScrollPosition();
      }, 200);
  
      if (!scrollPosition) {
        return;
      }
      var pos = scrollPosition.top;
      if (pos > 0) {
        $scope.txHistoryPaddingBottom = "200px";
      }
      if (pos === prevPos) {
        return;
      }
      prevPos = pos;
      $scope.scrollPosition = pos;
    }

    var scrollWatcherInitialized;    

    $scope.$on("$ionicView.enter", function(event, data) {
      $ionicNavBarDelegate.showBar(true);
      if ($scope.isCordova && $scope.isAndroid) setAndroidStatusBarColor();
      scrollWatcherInitialized = true;
    });

    $scope.displayBalanceAsFiat = true;
    $scope.$on('$ionicView.beforeLeave', function() {
      console.log('tab-cashshuffle _onBeforeLeave()');
      walletAddressListenerService.stop();
    });

    $scope.requestSpecificAmount = function() {
      sendFlowService.start({
        toWalletId: $scope.wallet.credentials.walletId,
        isRequestAmount: true
      });
    };


    $scope.setAddress = function(newAddr, copyAddress) {
      $scope.addr = null;
      if (!$scope.wallet || $scope.generatingAddress || !$scope.wallet.isComplete()) return;
      $scope.generatingAddress = true;
      walletService.getAddress($scope.wallet, newAddr, function(err, addr) {
        $scope.generatingAddress = false;

        if (err) {
          //Error is already formated
          popupService.showAlert(err);
        }

        if ($scope.wallet.coin === 'bch') {
          bchAddresses = bitcoinCashJsService.translateAddresses(addr);
          $scope.addr = bchAddresses[$scope.bchAddressType.type];
          $scope.addrBchLegacy = bchAddresses['legacy'];
          walletAddressListenerService.listenTo($scope.addrBchLegacy, $scope.wallet, $scope, _receivedPayment);
        } else {
          $scope.addr = addr;
          walletAddressListenerService.listenTo($scope.addr, $scope.wallet, $scope, _receivedPayment);
        }

        if (copyAddress === true) {
          try {
            clipboardService.copyToClipboard($scope.wallet.coin == 'bch' && $scope.bchAddressType.type == 'cashaddr' ? 'bitcoincash:' + $scope.addr : $scope.addr);
          } catch (error) {
            $log.debug('Error copying to clipboard:');
            $log.debug(error);
          }
        }

        $timeout(function() {
          $scope.$apply();
        }, 10);
      });
    };

    function _receivedPayment(data) {
      data = JSON.parse(data);
      if (data) {
        var watchAddress = $scope.wallet.coin == 'bch' ? $scope.addrBchLegacy : $scope.addr;
        for (var i = 0; i < data.outputs.length; i++) {
          if (data.outputs[i].address == watchAddress) {
            $scope.paymentReceivedAmount = txFormatService.formatAmount(data.outputs[i].value, 'full');
            $scope.paymentReceivedAlternativeAmount = '';  // For when a subsequent payment is received.
            txFormatService.formatAlternativeStr($scope.wallet.coin, data.outputs[i].value, function(alternativeStr){
              if (alternativeStr) {
                $scope.$apply(function () {
                  $scope.paymentReceivedAlternativeAmount = alternativeStr;
                });
              }
            });
          }
        }
        $scope.paymentReceivedCoin = $scope.wallet.coin;

        var channel = "ga";
        if (platformInfo.isCordova) {
          channel = "firebase";
        }
        var log = new window.BitAnalytics.LogEvent("transfer_success", [{
          "coin": $scope.wallet.coin,
          "type": "incoming"
        }, {}, {}], [channel, 'leanplum']);
        window.BitAnalytics.LogEventHandlers.postEvent(log);

        if ($state.current.name === "tabs.receive") {
          soundService.play('misc/payment_received.mp3');
        } 

        // Notify new tx
        $scope.$emit('bwsEvent', $scope.wallet.id);

        $scope.$apply(function () {
          $scope.showingPaymentReceived = true;
        });

      }
    }

    $scope.displayAddress = function(type) {
      $scope.bchAddressType.type = type;
      $scope.addr = bchAddresses[$scope.bchAddressType.type];
    }

    $scope.openBackupNeededModal = function() {
      $ionicModal.fromTemplateUrl('views/includes/backupNeededPopup.html', {
        scope: $scope,
        backdropClickToClose: false,
        hardwareBackButtonClose: false
      }).then(function(modal) {
        $scope.BackupNeededModal = modal;
        $scope.BackupNeededModal.show();
      });
    };

    $scope.close = function() {
      $scope.BackupNeededModal.hide();
      $scope.BackupNeededModal.remove();
    };

    $scope.doBackup = function() {
      $scope.close();
      $scope.goToBackupFlow();
    };

    $scope.goToBackupFlow = function() {
      $state.go('tabs.receive.backupWarning', {
        from: 'tabs.receive',
        walletId: $scope.wallet.credentials.walletId
      });
    };

    $scope.shouldShowReceiveAddressFromHardware = function() {
      var wallet = $scope.wallet;
      if (wallet.isPrivKeyExternal() && wallet.credentials.hwInfo) {
        return (wallet.credentials.hwInfo.name == walletService.externalSource.intelTEE.id);
      } else {
        return false;
      }
    };

    $scope.showReceiveAddressFromHardware = function() {
      var wallet = $scope.wallet;
      if (wallet.isPrivKeyExternal() && wallet.credentials.hwInfo) {
        walletService.showReceiveAddressFromHardware(wallet, $scope.addr, function() {});
      }
    };

    $scope.shuffleCash = function() {
      console.log('onCLicl');      
    };

    var refreshInterval = null;

    $scope.$on("$ionicView.afterEnter", function onAfterEnter(event, data) {
      updateTxHistoryFromCachedData();
      $scope.updateAll(true, true);
      refreshInterval = $interval($scope.onRefresh, 10 * 1000);
      $timeout(function() {
        getScrollPosition();
      }, 1000);
    });

    $scope.$on("$ionicView.afterLeave", function(event, data) {
      if (refreshInterval !== null) {
        $interval.cancel(refreshInterval);
        refreshInterval = null;
      }
      if ($window.StatusBar) {
        $window.StatusBar.backgroundColorByHexString('#000000');
      }
    });



    $scope.$on("$ionicView.leave", function(event, data) {
      console.log('tab-cashshuffle leave');
      lodash.each(listeners, function(x) {
        x();
      });
    });

    function getSatoshiDiceIconUrl() {
      return satoshiDiceService.iconUrl;
    }

    $scope.$on("$ionicView.beforeEnter", function(event, data) {
      $scope.wallets = profileService.getWallets();
      $scope.singleWallet = $scope.wallets.length == 1;
      
      console.log("before enter call");
      
      configService.whenAvailable(function (config) {
        $scope.selectedPriceDisplay = config.wallet.settings.priceDisplay;
        $scope.displayBalanceAsFiat = config.wallet.settings.priceDisplay === 'fiat';
        $timeout(function () {
          $scope.$apply();
        });
      });


      var selectedWallet = null;
      if (data.stateParams.walletId) { // from walletDetails
        selectedWallet = checkSelectedWallet(profileService.getWallet(data.stateParams.walletId), $scope.wallets);
      } else {
        // select first wallet if no wallet selected previously
        selectedWallet = checkSelectedWallet($scope.wallet, $scope.wallets);
      }

      $scope.walletId = selectedWallet.id;
      $scope.wallet = selectedWallet;
      
      if ($window.StatusBar) {
        $window.StatusBar.styleLightContent();
      }
      
      
      if (!$scope.wallet) return;
      $scope.status = $scope.wallet.status;
      $scope.requiresMultipleSignatures = $scope.wallet.credentials.m > 1;
  
      $scope.vm.gettingInitialHistory = true;
  
      addressbookService.list(function(err, ab) {
        if (err) $log.error(err);
        $scope.addressbook = ab || {};
      });
  
      if (!$scope.wallets[0]) return;


      $scope.onWalletSelect(selectedWallet);
      $scope.showShareButton = platformInfo.isCordova ? (platformInfo.isIOS ? 'iOS' : 'Android') : null;

      listeners = [
        $rootScope.$on('bwsEvent', function(e, walletId, type, n) {
          // Update current address
          if (walletId == $scope.wallet.id && e.type != 'NewAddress') $scope.updateAll(false, false);
          if ($scope.wallet && walletId == $scope.wallet.id && type == 'NewIncomingTx') $scope.setAddress(true);
        }),
        $rootScope.$on('Local/TxAction', function(e, walletId) {
          if (walletId == $scope.wallet.id)
            $scope.updateAll(false, false);
        }),

      ];    
    });
    
    function setAndroidStatusBarColor() {
      var SUBTRACT_AMOUNT = 15;
      var walletColor;
      if (!$scope.wallet.color) walletColor = appConfigService.name == 'copay' ? '#019477' : '#4a90e2';
      else walletColor = $scope.wallet.color;
      var rgb = hexToRgb(walletColor);
      var keys = Object.keys(rgb);
      keys.forEach(function(k) {
        if (rgb[k] - SUBTRACT_AMOUNT < 0) {
          rgb[k] = 0;
        } else {
          rgb[k] -= SUBTRACT_AMOUNT;
        }
      });
      var statusBarColorHexString = rgbToHex(rgb.r, rgb.g, rgb.b);
      if ($window.StatusBar)
        $window.StatusBar.backgroundColorByHexString(statusBarColorHexString);
    }
  
    function hexToRgb(hex) {
      // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
      var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
      hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
      });
  
      var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    }
  
    function componentToHex(c) {
      var hex = c.toString(16);
      return hex.length == 1 ? "0" + hex : hex;
    }
  
    function rgbToHex(r, g, b) {
      return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }

    var checkSelectedWallet = function(wallet, wallets) {
      if (!wallet) return wallets[0];
      var w = lodash.find(wallets, function(w) {
        return w.id == wallet.id;
      });
      if (!w) return wallets[0];
      return wallet;
    }

    var setProtocolHandler = function() {
      $scope.protocolHandler = walletService.getProtocolHandler($scope.wallet);
    }

    $scope.$watch('showWallets' , function () {
      if ($scope.showingPaymentReceived) {
        $scope.showingPaymentReceived = false;
      }
    });

    $scope.onWalletSelect = function(wallet) {
      $scope.wallet = wallet;
      setProtocolHandler();
      $scope.setAddress();
    };


    $scope.showWalletSelector = function() {
      if ($scope.singleWallet) return;
      $scope.walletSelectorTitle = gettextCatalog.getString('Select a wallet');
      $scope.showWallets = true;
    };
    
  }
})();
