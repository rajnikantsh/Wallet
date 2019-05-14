'use strict';

angular.module('copayApp.controllers').controller('preferencesAltServerController',
  function($scope, $log, $timeout, $ionicHistory, configService, rateService, lodash, profileService, walletService, storageService, $ionicNavBarDelegate) {

    var next = 10;
    var completeAlternativeList = [];

    var popularServerList = [
      {name: 'Localhost', order: 0},
      {name: '127.0.0.1', order: 1},
    ]

    function init() {
      var unusedServerList = [{
        name: 'india.com'
      }, {
        name: 'usa.com'
      }];
      
      rateService.whenAvailable(function() {

        $scope.listComplete = false;

        var idx = lodash.indexBy(unusedServerList, 'name');
        var idx2 = lodash.indexBy($scope.lastUsedAltServerList, 'name');
        var idx3 = lodash.indexBy(popularServerList, 'name');
        var json = {'shuffle.imaginary.cash': {
            'port' : 8080,
            'ssl'  : true,
            'info' : 8081
          },
          'cashshuffle.tartarusgroup.com':
          {
            'port' : 8080,
            'ssl'  : false,
            'info' : 8081
          }
        };

        var alternatives = [{'name':'koooo'},{'name':'loooo'}];//rateService.listAlternatives(true);

        lodash.each(json, function(c){
          console.log("logger ---> "+c.name)
        });
        lodash.each(alternatives, function(c) {
          if (idx3[c.name]) {
              idx3[c.name].name = c.name;
          }
          if (!idx[c.name] && !idx2[c.name] && !idx3[c.name]) {
            completeAlternativeList.push(c);
          }
        });

        $scope.altServerList = completeAlternativeList.slice(0, 10);
        $scope.lastUsedPopularList = lodash.unique(lodash.union($scope.lastUsedAltServerList, popularServerList), 'name');

        $timeout(function() {
          $scope.$apply();
        });
      });
    }

    $scope.loadMore = function() {
      $timeout(function() {
        $scope.altServerList = completeAlternativeList.slice(0, next);
        next += 10;
        $scope.listComplete = $scope.altServerList.length >= completeAlternativeList.length;
        $scope.$broadcast('scroll.infiniteScrollComplete');
      }, 100);
    };

    $scope.findServer = function(search) {
      if (!search) init();
      var list = lodash.unique(lodash.union(completeAlternativeList, lodash.union($scope.lastUsedAltServerList, popularServerList)), 'name');
      $scope.altServerList = lodash.filter(list, function(item) {
        var val = item.name
        var val2 = item.name;
        return lodash.includes(val.toLowerCase(), search.toLowerCase()) || lodash.includes(val2.toLowerCase(), search.toLowerCase());
      });
      $timeout(function() {
        $scope.$apply();
      });
    };

    $scope.save = function(newAltServer) {
      var opts = {
        wallet: {
          settings: {
            alternativeName: newAltServer.name,
            alternativename: newAltServer.name,
          }
        }
      };

      configService.set(opts, function(err) {
        if (err) $log.warn(err);

        $ionicHistory.goBack();
        saveLastUsed(newAltServer);
        walletService.updateRemotePreferences(profileService.getWallets());
      });
    };

    function saveLastUsed(newAltServer) {
      $scope.lastUsedAltServerList.unshift(newAltServer);
      $scope.lastUsedAltServerList = lodash.uniq($scope.lastUsedAltServerList, 'name');
      $scope.lastUsedAltServerList = $scope.lastUsedAltServerList.slice(0, 3);
      storageService.setLastServerUsed(JSON.stringify($scope.lastUsedAltServerList), function() {});
    };

    $scope.$on("$ionicView.beforeEnter", function(event, data) {
      var config = configService.getSync();
      $scope.currentServer = config.wallet.settings.alternativename;

      storageService.getLastServerUsed(function(err, lastUsedAltServer) {
        $scope.lastUsedAltServerList = lastUsedAltServer ? JSON.parse(lastUsedAltServer) : [];
        init();
      });
    });

    $scope.$on("$ionicView.enter", function(event, data) {
      $ionicNavBarDelegate.showBar(true);
    });
  });
