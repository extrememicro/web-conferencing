/**
 * Web Conferencing integration for eXo Platform.
 */
(function($, cCometD) {
	"use strict";
	
	// ******** Utils ********

	/** For debug logging. */
	var objId = Math.floor((Math.random() * 1000) + 1);
	var logPrefix = "[videocall_" + objId + "] ";
	var log = function(msg, e) {
		if (typeof console != "undefined" && typeof console.log != "undefined") {
			var isoTime = " -- " + new Date().toISOString();
			if (e) {
				if (e instanceof Error) {
					console.log(logPrefix + msg + ". " + (e.name && e.message ? e.name + ": " + e.message : e.toString()) + isoTime);
				} if (e.name && e.message) {
					console.log(logPrefix + msg + ". " + e.name + ": " + e.message + isoTime);
				} else {
					console.log(logPrefix + msg + ". Cause: " + (typeof e == "string" ? e : JSON.stringify(e)) + isoTime);
				}
				if (typeof e.stack != "undefined") {
					console.log(e.stack);
				}
			} else {
				console.log(logPrefix + msg + isoTime);
			}
		}
	};
	//log("> Loading at " + location.origin + location.pathname);

	// Returns the version of Windows Internet Explorer or a -1
	// (indicating the use of another browser).
	var getIEVersion = function() {
		var rv = -1;
		// Return value assumes failure.
		if (navigator.appName == "Microsoft Internet Explorer") {
			var ua = navigator.userAgent;
			var re = new RegExp("MSIE ([0-9]{1,}[\.0-9]{0,})");
			if (re.exec(ua) != null)
				rv = parseFloat(RegExp.$1);
		}
		return rv;
	};
	
	var pageBaseUrl = function(theLocation) {
		if (!theLocation) {
			theLocation = window.location;
		}

		var theHostName = theLocation.hostname;
		var theQueryString = theLocation.search;

		if (theLocation.port) {
			theHostName += ":" + theLocation.port;
		}

		return theLocation.protocol + "//" + theHostName;
	};

	var getPortalUser = function() {
		return eXo.env.portal.userName;
	};

	var decodeString = function(str) {
		if (str) {
			try {
				str = str.replace(/\+/g, " ");
				str = decodeURIComponent(str);
				return str;
			} catch(e) {
				log("WARN: error decoding string " + str + ". " + e, e);
			}
		}
		return null;
	}

	var encodeString = function(str) {
		if (str) {
			try {
				str = encodeURIComponent(str);
				return str;
			} catch(e) {
				log("WARN: error decoding string " + str + ". " + e, e);
			}
		}
		return null;
	};

	// ******** UI utils **********

	/**
	 * Open pop-up.
	 */
	var popupWindow = function(url) {
		var w = 650;
		var h = 400;
		var left = (screen.width / 2) - (w / 2);
		var top = (screen.height / 2) - (h / 2);
		return window.open(url, 'contacts', 'width=' + w + ',height=' + h + ',top=' + top + ',left=' + left);
	};
	
	// UI messages
	// Used to show immediate notifications in top right corner.
	// This functionality requires pnotifyJQuery and jqueryui CSS.

	var NOTICE_WIDTH = "380px";
  
  var isIOS = /iPhone|iPod|iPad/.test(navigator.userAgent);
  var isAndroid = /Android/.test(navigator.userAgent);
  var isWindowsMobile = /IEmobile|WPDesktop|Windows Phone/i.test(navigator.userAgent) || /WM\s*\d.*.Edge\/\d./i.test(navigator.userAgent);
  
  var CACHE_LIVETIME = 30000;
  
	/**
	 * Show notice to user. Options support "icon" class, "hide", "closer" and "nonblock" features.
	 */
	var showNotice = function(type, title, text, options) {
		var noticeOptions = {
			title : title,
			text : text,
			type : type,
			icon : "picon " + ( options ? options.icon : ""),
			hide : options && typeof options.hide != "undefined" ? options.hide : false,
			delay : options && typeof options.delay != "undefined" ? options.delay : undefined,
			closer : options && typeof options.closer != "undefined" ? options.closer : true,
			sticker : false,
			opacity : .85,
			shadow : true,
			width : options && options.width ? options.width : NOTICE_WIDTH,
			nonblock : options && typeof options.nonblock != "undefined" ? options.nonblock : false,
			nonblock_opacity : .45,
			addclass : options && options.addclass ? options.addclass : "",
			cornerclass : options && options.cornerclass ? options.cornerclass : "",
			after_init : function(pnotify) {
				if (options && typeof options.onInit == "function") {
					options.onInit(pnotify);
				}
			}
		};
		return $.pnotify(noticeOptions);
	};

	/**
	 * Show error notice to user. Error will stick until an user close it.
	 */
	var showError = function(title, text, onInit) {
		return showNotice("error", title, text, {
			icon : "picon-dialog-error",
			hide : false,
			delay : 0,
			onInit : onInit
		});
	};

	/**
	 * Show info notice to user. Info will be shown for 8sec and hidden then.
	 */
	var showInfo = function(title, text, onInit) {
		return showNotice("info", title, text, {
			hide : true,
			delay : 8000,
			icon : "picon-dialog-information",
			onInit : onInit
		});
	};

	/**
	 * Show warning notice to user. Info will be shown for 8sec and hidden then.
	 */
	var showWarn = function(title, text, onInit) {
		return showNotice("exclamation", title, text, {
			hide : true,
			delay : 30000,
			icon : "picon-dialog-warning",
			onInit : onInit
		});
	};
	
	/**
	 * Show warning notice bar to user. Info will be shown for 8sec and hidden then.
	 */
	var showWarnBar = function(title, text, onInit) {
		return showNotice("exclamation", title, text, {
			hide : false,
			delay : 30000,
			icon : "picon-dialog-warning",
			width : "100%",
			addclass : "stack-bar-top",
      cornerclass : "",
			onInit : onInit
		});
	};

	// ******** REST services ********
	var prefixUrl = pageBaseUrl(location);

	var initRequest = function(request) {
		var process = $.Deferred();

		// stuff in textStatus is less interesting: it can be "timeout",
		// "error", "abort", and "parsererror",
		// "success" or smth like that
		request.fail(function(jqXHR, textStatus, err) {
			if (jqXHR.status != 309) {
				// check if response isn't JSON
				var data;
				try {
					data = $.parseJSON(jqXHR.responseText);
					if ( typeof data == "string") {
						// not JSON
						data = jqXHR.responseText;
					}
				} catch(e) {
					// not JSON
					data = jqXHR.responseText;
				}
				// in err - textual portion of the HTTP status, such as "Not
				// Found" or "Internal Server Error."
				process.reject(data, jqXHR.status, err, jqXHR);
			}
		});
		// hacking jQuery for statusCode handling
		var jQueryStatusCode = request.statusCode;
		request.statusCode = function(map) {
			var user502 = map[502];
			if (!user502) {
				map[502] = function() {
					// treat 502 as request error also
					process.reject("Bad gateway", 502, "error");
				};
			}
			return jQueryStatusCode(map);
		};

		request.done(function(data, textStatus, jqXHR) {
			process.resolve(data, jqXHR.status, textStatus, jqXHR);
		});

		// custom Promise target to provide an access to jqXHR object
		var processTarget = {
			request : request
		};
		return process.promise(processTarget);
	};

	function Cache() {
		var cache = {};
		var locks = {};
		
		this.put = function(key, value) {
			cache[key] = value;
			setTimeout(function() {
				cache[key] = null;
  		}, CACHE_LIVETIME);
		};
		
		this.get = function(key) {
			// TODO do we need this check?
			if (cache.hasOwnProperty(key)) {
				return cache[key];
			} else {
				return null;
			}
		};
		
		this.remove = function(key) {
			cache[key] = null;
		};
		
		this.lock = function(key, worker) {
			locks[key] = worker;
		};
		
		this.locked = function(key) {
			if (locks.hasOwnProperty(key)) {
				return locks[key];
			} else {
				return null;
			}
		};
		
		this.unlock = function(key) {
			locks[key] = null;
		};
	}
	
	var getCached = function(key, cache, getFunc) {
		var res = cache.locked(key);
		if (res) {
			return res;
		}
		var worker = $.Deferred();
		cache.lock(key, res = worker.promise());
		var cached = cache.get(key);
		if (cached) {
			cache.unlock(key);
			worker.notify("CACHED " + key);
			worker.resolve(cached, "cached");
  	} else if (getFunc) {
  		var unlock = true;
  		var get = getFunc(key);
  		get.done(function(data, status, textStatus, jqXHR) {
  			cache.put(key, data);
  			cache.unlock(key);
  			unlock = false;
  			worker.resolve(data, status, textStatus, jqXHR);
	  	});
  		get.fail(function(data, status, err, jqXHR) {
  			cache.unlock(key);
  			unlock = false;
  			worker.reject(data, status, err, jqXHR);
  		});
  		get.always(function() {
  			if (unlock) {
  				// unlock again here - for a case if will not do in done/fail :)
  				cache.unlock(key); 
  			}
  		});
  	} else {
  		cache.unlock(key);
  		worker.notify("NOT FOUND " + key + ". Getter function not provided.");
  		worker.reject("Not found: " + key);
  	}
  	return res;
	};
	
	var getCallInfo = function(id) {
		var request = $.ajax({
			async : true,
			type : "GET",
			url : prefixUrl + "/portal/rest/videocalls/call/" + id
		});
		return initRequest(request);
	};
	
	var deleteCallInfo = function(id) {
		var request = $.ajax({
			async : true,
			type : "DELETE",
			url : prefixUrl + "/portal/rest/videocalls/call/" + id
		});
		return initRequest(request);
	};
	
	var postCallInfo = function(id, info) {
		var request = $.ajax({
			async : true,
			type : "POST",
			url : prefixUrl + "/portal/rest/videocalls/call/" + id,
			data : info
		});
		return initRequest(request);
	};
	
	var putCallInfo = function(id, state) {
		var request = $.ajax({
			async : true,
			type : "PUT",
			url : prefixUrl + "/portal/rest/videocalls/call/" + id,
			data : {
				state : state
			}
		});
		return initRequest(request);
	}; 
	
	var putUserCallState = function(callId, state) {
		var request = $.ajax({
			async : true,
			type : "PUT",
			url : prefixUrl + "/portal/rest/videocalls/user/me/call/" + callId,
			data : {
				state : state
			}
		});
		return initRequest(request);
	};
	
	//TODO not used
	var postUserCallId = function(callId) {
		var request = $.ajax({
			async : true,
			type : "POST",
			url : prefixUrl + "/portal/rest/videocalls/user/me/call/" + callId
		});
		return initRequest(request);
	};
	
	// TODO not used
	var deleteUserCallId = function(callId) {
		var request = $.ajax({
			async : true,
			type : "DELETE",
			url : prefixUrl + "/portal/rest/videocalls/user/me/call/" + callId
		});
		return initRequest(request);
	};
	
	var getUserCallsState = function() {
		var request = $.ajax({
			async : true,
			type : "GET",
			url : prefixUrl + "/portal/rest/videocalls/user/me/calls"
		});
		return initRequest(request);
	};
	
	var pollUserUpdates = function(userId) {
		var request = $.ajax({
			async : true,
			type : "GET",
			url : prefixUrl + "/videocalls/updates/" + userId,
			timeout : 310000, 
			headers: {
		    "Cache-Control": "no-cache"
		  }
		});
		return initRequest(request);
	};
	
	var cachedUsers = new Cache();
	var getUserInfoReq = function(userId) {
		var request = $.ajax({
			async : true,
			type : "GET",
			url : prefixUrl + "/portal/rest/videocalls/user/" + userId
		});
		return initRequest(request);
	};
	var getUserInfo = function(userId) {
		return getCached(userId, cachedUsers, getUserInfoReq);
	};

	/** @Deprecated TODO not yet used */
	var getUsersInfoReq = function(names) {
		var request = $.ajax({
			async : true,
			type : "GET",
			url : prefixUrl + "/portal/rest/videocalls/users",
			data : {
				names : names
			}
		});
		return initRequest(request);
	};
	var getUsersInfo = function(names) {
		// TODO get by one user using local cache or get all from the server, or get all not cached from the server?
		// 1. get by one user using local cache
		var all = $.Deferred();
		var users = [];
		var workers = [];
		for (var i=0; i<names.length; i++) {
			var uname = names[i];
			var get = getCached(uname, cachedUsers, getUserInfoReq);
			get.done(function(u) {
				users.push(u);
			});
			workers.push(get);
		}
		$.when.apply($, workers).always(function() {
			all.resolve(users);
		});
		return all.promise();
	};

	var cachedSpaces = new Cache();
	var getSpaceInfoReq = function(spaceId) {
		var request = $.ajax({
			async : true,
			type : "GET",
			url : prefixUrl + "/portal/rest/videocalls/space/" + spaceId
		});
		return initRequest(request);
	};
	var getSpaceInfo = function(spaceId) {
		return getCached(spaceId, cachedSpaces, getSpaceInfoReq);
	};
	
	var cachedRooms = new Cache();
	var getRoomInfoReq = function(roomRef, title, members) {
		var q = "";
		if (title) {
			q += "?title=" + encodeURIComponent(title); 
		}
		if (members && members.length > 0) {
			if (q.length == 0) {
				q += "?";
			} else {
				q += "&";
			}
			q += "members=" + encodeURIComponent(members.join(";"));
		}
		var request = $.ajax({
			async : true,
			type : "GET",
			url : prefixUrl + "/portal/rest/videocalls/room/" + roomRef + q
		});
		return initRequest(request);
	};
	var getRoomInfo = function(id, name, title, members) {
		return getCached(name + "/" + id, cachedRooms, function(key) {
			return getRoomInfoReq(key, title, members);
		});
	};
	
	var serviceGet = function(url, data) {
		var request = $.ajax({
			async : true,
			type : "GET",
			url : url,
			dataType : "json",
			data : data ? data : {}
		});
		return initRequest(request);
	};
	
	var prepareUser = function(user) {
		user.title = user.firstName + " " + user.lastName;
	};
	
	/**
	 * VideoCalls core class.
	 */
	function VideoCalls() {

		// ******** Context ********
		var currentUser, currentSpaceId, currentRoomTitle;

		// CometD transport bus
		var cometd, cometdContext;
		
		// Registered providers
		var providers = [];

		var errorText = function(err) {
			return err && err.message ? err.message : err;
		};
		this.errorText = errorText;
		
		var cometdParams = function(params) {
			return $.extend(params, cCometD.eXoSecret, cometdContext);
		};
		
		var initContext = function() {
			var context = {
				currentUser : currentUser,
				isIOS : isIOS,
				isAndroid : isAndroid,
				isWindowsMobile : isWindowsMobile,
				details : function() {
					// this method should not be used in this context, thus keep it for unification only
					var data = $.Deferred();
					data.resolve([], context.space.id, context.space.title);
					return data.promise();
				}
			};
			if (currentSpaceId) {
				context.spaceId = currentSpaceId; 
			} else {
				context.spaceId = null; 
			}
			if (currentRoomTitle) {
				context.roomTitle = currentRoomTitle;
			} else {
				context.roomTitle = null;
			}
			return context;
		};

		
		var initProvider = function(provider) {
			var process = $.Deferred();
			if (provider.init && provider.hasOwnProperty("init")) {
				provider.init(initContext()).done(function() {
					provider.isInitialized = true;
					log("Initialized call provider: " + provider.getType());
					process.resolve(true);
				}).fail(function(err) {
					log("ERROR initializing call provider '" + provider.getType() + "': " + err);
					process.reject(err);
				});
			} else {
				log("Marked call provider as Initialized: " + provider.getType());
				provider.isInitialized = true;
				process.resolve(false);
			}
			return process.promise();
		};
		
		/**
		 * Add call button to given target element.
		 */
		var addCallButton = function($target, context) {
			var initializer = $.Deferred();
			if ($target.length > 0) {
				// We need deal with non consecutive asynchronous calls to this method,
				// 1) use only currently available providers - froze the state
				var addProviders = providers.slice();
				if (addProviders.length > 0) {
					var buttonClass = "startCallButton";
					var providerFlag = "hasProvider_";
					var contextName = (context.spaceId ? context.spaceId : (context.roomTitle ? context.roomTitle : context.userId));
					// 2) if already calling, then need wait for previous call completion and then re-call this method 
					var prevInitializer = $target.data("callbuttoninit");
					if (prevInitializer) {
						log(">>> addCallButton > init WAIT " + contextName + " providers: " + addProviders.length);
						prevInitializer.always(function() {
							log(">>> addCallButton > init RESUMED " + contextName + " providers: " + addProviders.length);
							addCallButton($target, context).done(function($container) {
								initializer.resolve($container);
							}).fail(function(err) {
								initializer.reject(err);
							});
						});
					} else {
						$target.data("callbuttoninit", initializer);
						//log(">>> addCallButton > init " + contextName + " providers: " + addProviders.length);
						initializer.always(function() {
							$target.removeData("callbuttoninit");
							//log("<<< addCallButton < init " + contextName + " providers: " + addProviders.length);
						});
						// Do the main work here
						var $container = $target.find(".callButtonContainer");
						var $dropdown = $container.find(".dropdown-menu");
						var newDropdown = false;
						if ($container.length == 0) {
							// TODO May 22 2017: btn-group removed
							$container = $("<div style='display: none;' class='callButtonContainer'></div>");
							$target.append($container);
						} else if ($dropdown.length == 0) { 
							if ($container.find("." + buttonClass).length > 0) {
								$dropdown = $("<ul class='dropdown-menu'></ul>");
								newDropdown = true;
							} // else, need add first & default button (see in addProviderButton())
						}
						var workers = [];
						var buttons = [];
						function addProviderButton(provider, button) {
							//log(">>> addCallButton > adding > " + contextName + "(" + provider.getTitle() + ") for " + context.currentUser.id);
							// need do this in a function to keep worker variable in the scope of given button when it will be done 
							var bworker = $.Deferred();
							button.done(function($button) {
								// TODO reorder buttons in business priority 
								if ($dropdown.length > 0) {
									// add in dropdown
									//log(">>> addCallButton > add in dropdown > " + contextName + "(" + provider.getTitle() + ") for " + context.currentUser.id);
									$button.addClass(buttonClass);
									var $li = $("<li></li>");
									$li.append($button)
									$dropdown.append($li);	
								} else {
									// add first & default button
									//log(">>> addCallButton > add first & default button > " + contextName + "(" + provider.getTitle() + ") for " + context.currentUser.id);
									$button.addClass("btn " + buttonClass); // btn btn-primary actionIcon 
									$container.append($button);
									$dropdown = $("<ul class='dropdown-menu'></ul>");
									newDropdown = true;
								}
								buttons.push($button);
								log("<<< addCallButton DONE < " + contextName + "(" + provider.getTitle() + ") for " + context.currentUser.id);
							});
							button.fail(function(msg) {
								log("<<< addCallButton CANCELED < " + contextName + "(" + provider.getTitle() + ") for " + context.currentUser.id + ": " + msg);
							});
							button.always(function() {
								// even if was fail, we treat it as canceled and mark the provider
								$container.data(providerFlag + provider.getType(), true);
								// for the below $.when's always callback we need resolve all workers independently succeeded or failed 
								bworker.resolve();
							});
							workers.push(bworker.promise());
						}
						// we have an one button for each provider
						log(">>> addCallButton > " + contextName + " for " + context.currentUser.id + " providers: " + addProviders.length);
						for (var i = 0; i < addProviders.length; i++) {
							var p = addProviders[i];
							log(">>> addCallButton > next provider > " + contextName + "(" + p.getTitle() + ") for " + context.currentUser.id + " providers: " + addProviders.length);
							if ($container.data(providerFlag + p.getType())) {
								log("<<< addCallButton DONE (already) < " + contextName + "(" + p.getTitle() + ") for " + context.currentUser.id);
							} else {
								var b = p.callButton(context);
								addProviderButton(p, b);
							}
						}
						if (workers.length > 0) {
							$.when.apply($, workers).always(function() {
								if (newDropdown && $dropdown.children().length > 0) {
									var $toggle = $("<button class='btn dropdown-toggle' data-toggle='dropdown'>" + 
											"<i class='uiIconMiniArrowDown uiIconLightGray'></i></span></button>");
									$container.append($toggle);
									$container.append($dropdown);
								}
								if (buttons.length > 0) {
									var $allButtons = $container.find("." + buttonClass);
									if ($allButtons.length > 1) {
										// ensure first button of all is a default one (for CSS)
										var $firstButon = $allButtons.first();
										if (!$firstButon.hasClass("defaultCallButton")) {
											$firstButon.addClass("defaultCallButton");
										}
										// TODO add default icon, e.g. uiIconVideo 
									}
									$container.show();
									initializer.resolve($container);
								} else {
									initializer.reject("Nothing added");
								}
			        });
						} else {
							initializer.reject("Nothing to add");
						}
					}
				} else {
					initializer.reject("No providers");
				}	
			} else {
				initializer.reject("Target not found");
			}
			return initializer.promise();
		};
		
		var hasChatApplication = function() {
			return typeof(chatApplication) == "object" && chatApplication;
		};
		this.hasChatApplication = hasChatApplication;
		
		var currentChatRoom = function() {
			if (hasChatApplication()) {
				return chatApplication.targetUser;
			} else {
				return null;
			}
		};
		this.currentChatRoom = currentChatRoom;
		
		var spaceChatRoom = function(id) {
			var process = $.Deferred(); 
			if (id.startsWith("space-")) {
				process.resolve(id); // already
			} else {
				initRequest($.ajax({
				  url: chatApplication.jzChatGetRoom,
				  data: {
				    "user": chatApplication.username,
				    "targetUser": id,
				    "type": "space-name",
				    "dbName": chatApplication.dbName,
				    "token": chatApplication.token,
				    "isAdmin" : false,
				    "withDetail": true
				  },
				  headers: {
				    "Authorization": "Bearer " + chatApplication.token
				  }
				})).done(function(room) {
					process.resolve(room.user);
				}).fail(function (error, status) {
				  process.reject(error, status);
				});
			}
			return process.promise();
		};
		this.spaceChatRoom = spaceChatRoom;
		
		/**
		 * eXo Chat initialization
		 */
		var initChat = function() {
			$(function() {
				var $chat = $("#chat-application");
				// chatApplication is a global on chat app page
				if (hasChatApplication() && $chat.length > 0) {
					log(">> initChat for " + chatApplication.username);
					var $roomDetail = $chat.find("#room-detail");
					
					var addRoomButtton = function() {
						$roomDetail.find(".callButtonContainerWrapper").hide(); // hide immediately
						setTimeout(function() {
							var roomId = chatApplication.targetUser;
							var roomTitle = chatApplication.targetFullname;
							//log(">>> addRoomButtton [" + roomTitle + "(" + roomId + ")] for " + chatApplication.username);
							if (roomId) {
								var isSpace = roomId.startsWith("space-");
								var isTeam = roomId.startsWith("team-");
								var isGroup = isSpace || isTeam;
								var isP2P = !isGroup;
								var $teamDropdown = $roomDetail.find(".chat-team-button-dropdown");
								if ($teamDropdown.length > 0) {
									var $wrapper = $roomDetail.find(".callButtonContainerWrapper");
									if ($wrapper.length > 0) {
										$wrapper.empty();
									} else {
										$wrapper = $("<div class='callButtonContainerWrapper pull-right' style='display: none;'></div>");
										$teamDropdown.after($wrapper);
									}
									var roomName = roomTitle.toLowerCase().split(" ").join("_");
									var chatContext = {
										currentUser : currentUser,
										roomId : roomId,
										roomName : roomName,
										roomTitle : roomTitle,
										isGroup : isGroup,
										isIOS : isIOS,
										isAndroid : isAndroid,
										isWindowsMobile : isWindowsMobile,
										details : function() {
											var data = $.Deferred();
										  if (isGroup) {
												chatApplication.getUsers(roomId, function (resp) {
													if (resp) {
														var unames = [];
														for (var i=0; i<resp.users.length; i++) {
															var u = resp.users[i];
															if (u && u.name && u.name != "null") {
																unames.push(u.name);
															}
														}
														//var room = getRoomInfo(roomId, roomName, roomTitle, unames); // TODO use for caching rooms
														var room = getRoomInfoReq(roomName + "/" + roomId, roomTitle, unames);
														room.done(function(info) {
															data.resolve(info);												
														});
														room.fail(function(e, status) {
															if (typeof(status) == "number" && status == 404) {
																var msg = (e.message ? e.message + " " : "Not found ");
																log(">> chatContext < ERROR get_room " + roomName + " (" + msg + ") for " + currentUser.id + ": " + (e.message ? e.message + " " : "Not found ") + roomName + ": " + JSON.stringify(e));
																data.reject(msg);
															} else {
																log(">> chatContext < ERROR get_room " + roomName + " for " + currentUser.id + ": " + JSON.stringify(e));
																data.reject(e);
															}
															// TODO notify the user?
														});																
													} else {
														log("ERROR: chatApplication.getUsers() return empty response");
														data.reject("Error reading Chat users");
													}
							          });
											} else {
												// roomId is an user name for P2P chats
												var get = getUserInfoReq(roomId);
												get.done(function(user) {
													data.resolve(user);												
												});
												get.fail(function(e, status) {
													if (typeof(status) == "number" && status == 404) {
														var msg = (e.message ? e.message + " " : "Not found ");
														log(">> initChat < ERROR get_user " + msg + " for " + currentUser.id + ": " + JSON.stringify(e));
														data.reject(msg);
													} else {
														log(">> initChat < ERROR get_user : " + JSON.stringify(e));
														data.reject(e);
														// TODO notify the user?
													}
												});
											}
											return data.promise();
										}
									};
									
									var addRoomCallButton = function() {
										var initializer = addCallButton($wrapper, chatContext);
										initializer.done(function($container) {
											$container.find(".startCallButton").addClass("chatCall");
											$container.find(".dropdown-menu").addClass("pull-right");
											$wrapper.show();
											log("<< initChat DONE " + roomTitle + " for " + currentUser.id);
										});
										initializer.fail(function(error) {
											log("<< initChat ERROR " + roomTitle + " for " + currentUser.id + ": " + error);
											if (error.indexOf("Nothing added") < 0) {
												$roomDetail.removeData("roomcallinitialized");
											}
										});										
									};
									if (isSpace) {
										currentRoomTitle = roomTitle;
										// XXX here we use the same technique as in chat.js's loadRoom(), 
										// here space pretty name is an ID
										var spaceId = roomTitle.toLowerCase().split(" ").join("_");
										currentSpaceId = spaceId;
									} else if (isTeam) {
										currentSpaceId = null;
										currentRoomTitle = roomTitle;
									}
									addRoomCallButton();
								} else {
									log("ERROR: Chat team dropdown not found");
									$roomDetail.removeData("roomcallinitialized");
								}
							} else {
								currentSpaceId = currentRoomTitle = null;
								log("ERROR: Chat room not found");
								$roomDetail.removeData("roomcallinitialized");
							}
						}, 1000); // XXX whoIsOnline may run 500-750ms on eXo Tribe
					};
					
					if (!$roomDetail.data("roomcallinitialized")) {
						$roomDetail.data("roomcallinitialized", true);
						addRoomButtton();
					} else {
						log("WARN: Chat room already initialized");
					}
					
					// User popovers in right panel
					var $chatUsers = $chat.find("#chat-users");
					$chatUsers.each(function(index, elem) {
						var $target = $(elem);
						if (!$target.data("usercallinitialized")) {
							$target.data("usercallinitialized", true);
							$target.click(function() {
								$roomDetail.removeData("roomcallinitialized");
								addRoomButtton();
							});
						}
					});
				}
			});
		};

		var userContext = function(userId) {
			var context = {
				currentUser : currentUser,
				userId : userId,
				isGroup : false,
				isIOS : isIOS,
				isAndroid : isAndroid,
				isWindowsMobile : isWindowsMobile,
				details : function() {
					var user = getUserInfoReq(userId);
					user.fail(function(e, status) {
						if (typeof(status) == "number" && status == 404) {
							log(">> userContext < ERROR get_user " + (e.message ? e.message + " " : "Not found ") + userId + " for " + currentUser.id + ": " + JSON.stringify(e));
						} else {
							log(">> userContext < ERROR get_user : " + JSON.stringify(e));
						}
					});
					return user;
				}
			};
			return context;
		};
		
		/**
		 * Add call button to user's on-mouse popups and panels.
		 */
		var initUserPopups = function(compId) {
			var $tiptip = $("#tiptip_content");
			// wait for UIUserProfilePopup script load
			if ($tiptip.length == 0 || $tiptip.hasClass("DisabledEvent")) {
				setTimeout($.proxy(initUserPopups, this), 250, compId);
				return;
			}
			
			var addUserButton = function($userAction, userId) {
				var initializer = addCallButton($userAction, userContext(userId));
				initializer.done(function($container) {
					$container.find(".startCallButton").addClass("popoverCall");
					log("<< initUserPopups DONE " + userId + " for " + currentUser.id);
				});
				initializer.fail(function(error) {
					log("<< initUserPopups ERROR " + userId + " for " + currentUser.id + ": " + error);
				});
				return initializer.promise();
			};

			var extractUserId = function($userLink) {
				var userId = $userLink.attr("href");
				return userId.substring(userId.lastIndexOf("/") + 1, userId.length);
			};

			// user popovers
			var customizePopover = function() {
				// wait for popover initialization
				setTimeout(function() {
					// Find user's first name for a tip
					var $profileLink = $tiptip.find("#tipName td>a[href*='\\/profile\\/']");
					if ($profileLink.length > 0) {
						var userId = extractUserId($profileLink);
						if (userId != currentUser.id) {
							var $userAction = $tiptip.find(".uiAction");
							var buttonUser = $userAction.data("callbuttonuser");
							if (!buttonUser || buttonUser != userId) {
								$userAction.data("callbuttonuser", userId);
								// cleanup after previous user
								$userAction.find(".callButtonContainer").empty();
								addUserButton($userAction, userId).done(function($container) {
									// XXX workaround to avoid first-child happen on call button in the popover
									$container.siblings(".btn").each(function() {
										var $s = $(this);
										if (!$s.hasClass("callButtonSibling")) {
											$s.addClass("callButtonSibling");										
										}
									});
									$container.prepend($("<div class='btn' style='display: none;'></div>"));
								});
							}
						}
					} else {
						log("<< initUserPopups WARN: popover profileName link not found");
					}
				}, 300);
			};
			// XXX wait for loading activity stream (TODO try rely on a promise)
			setTimeout(function() {
				// XXX hardcoded for peopleSuggest as no way found to add Lifecycle to its portlet (juzu)
				// user popovers in Social (authors, commenters, likers, profile, network, connections etc)
				$("#" + compId).find(".author>.ownerName, .author>.owner, .itemList .spaceBox, .activityAvatar, .commentItem>.commmentLeft, .commentItem>.commentLeft, .commentItem>.commentRight, .commentItem>.contentComment, .listLiked, .profileContainer, .avatarBox, .userProfileShare .pull-left, #onlineList").find("a[href*='\\/profile\\/']").each(function() {
					var $a = $(this);
					$a.mouseenter(function() {
						customizePopover();
					});
				});				
				
				// user popovers in Forum
				$("#" + compId).find("#UIForumContainer .postViewHeader").find("div[href*='\\/profile\\/']").each(function() {
					var $div = $(this);
					$div.mouseenter(function() {
						customizePopover();
					});
				});
				
				// user popovers in chat
				$("#" + compId).find(".room-user .avatarCircle").find("img[src*='\\/social/users\\/']").each(function() {
					var $user = $(this).closest(".room-user");
					//log("init chat popup " + $(this).attr("src"));
					$user.mouseenter(function() {
						customizePopover();
					});
				});
			}, 1000);

			// user panel in connections (all, personal and in space)
			// May 22 2017: we don't want Call Button in user cards
			/*$("#" + compId).find(".spaceBox").each(function(i, elem) {
				var $userLink = $(elem).find(".spaceTitle a:first");
				if ($userLink.length > 0) {
					//var userTitle = $userLink.text();
					var userId = extractUserId($userLink);
					if (userId != currentUser.id) {
						var $userAction = $(elem).find(".connectionBtn");
						addUserButton($userAction, userId).done(function($container) {
							$container.addClass("pull-right");
						});
					}
				}
			});*/

			// single user profile;
			$("#" + compId).find("#socialTopLayout").each(function(i, elem) {
				var $userStatus = $(elem).find("#UIStatusProfilePortlet .user-status");
				var userId = $userStatus.data("userid");
				if (userId != currentUser.id) {
					var $userActions = $(elem).find("#UIRelationshipAction .user-actions");
					addUserButton($userActions, userId).done(function($container) {
						$container.addClass("pull-left");
					});
					// Copied from Chat app: Fix PLF-6493: Only let hover happens on
					// connection buttons instead
					// of all in .user-actions
					var $btnConnections = $userActions.find(".show-default, .hide-default");
					var $btnShowConnection = $userActions.find(".show-default");
					var $btnHideConnection = $userActions.find(".hide-default");
					$btnShowConnection.show();
					$btnConnections.css("font-style", "italic");
					$btnHideConnection.hide();
					$btnConnections.removeClass("show-default hide-default");
					$btnConnections.hover(function(e) {
					  $btnConnections.toggle();
					});
				}
			});
		};
		
		var spaceContext = function(spaceId) {
			var context = {
				currentUser : currentUser,
				spaceId : spaceId,
				isGroup : true,
				isIOS : isIOS,
				isAndroid : isAndroid,
				isWindowsMobile : isWindowsMobile,
				details : function() {
					var space = getSpaceInfoReq(spaceId); // TODO use getSpaceInfo() for caching spaces
			  	space.fail(function(e, status) {
						if (typeof(status) == "number" && status == 404) {
							log(">> spaceContext < ERROR get_space " + spaceId + " for " + currentUser.id + ": " + (e.message ? e.message + " " : "Not found ") + spaceId + ": " + JSON.stringify(e));
						} else {
							log(">> spaceContext < ERROR get_space " + spaceId + " for " + currentUser.id + ": " + JSON.stringify(e));
						}
					});
					return space;
				}
			};
			return context;
		};
		
		/**
		 * Add call button to space's on-mouse popups and panels.
		 */
		var initSpacePopups = function(compId) {
			var $tiptip = $("#tiptip_content");
			// wait for popup script load
			if ($tiptip.length == 0 || $tiptip.hasClass("DisabledEvent")) {
				setTimeout($.proxy(initSpacePopups, this), 250, compId);
				return;
			}
			
			var addSpaceButton = function($spaceAction, spaceId) {
				var initializer = addCallButton($spaceAction, spaceContext(spaceId));
				initializer.done(function($container) {
					$container.find(".startCallButton").addClass("popoverCall");
					log("<< initSpacePopups DONE " + spaceId + " for " + currentUser.id);
				});
				initializer.fail(function(error) {
					log("<< initSpacePopups ERROR " + spaceId + " for " + currentUser.id + ": " + error);
				});
				return initializer.promise();
			};

			var extractSpaceId = function($spaceLink) {
				var spaceId = $spaceLink.attr("href");
				return spaceId.substring(spaceId.lastIndexOf("/") + 1, spaceId.length);
			};

			// space popovers
			var customizePopover = function() {
				// wait for popover initialization
				setTimeout(function() {
					// Find user's first name for a tip
					var $profileLink = $tiptip.find("#tipName #profileName>a[href*='\\/g/:spaces:']");
					if ($profileLink.length > 0) {
						var spaceId = extractSpaceName($profileLink);
						var $spaceAction = $tiptip.find(".uiAction");
						var buttonSpace = $spaceAction.data("callbuttonspace");
						if (!buttonSpace || buttonSpace != spaceId) {
							$spaceAction.data("callbuttonspace", spaceId);
							// cleanup after previous space
							$spaceAction.find(".callButtonContainer").empty();
							addSpaceButton($spaceAction, spaceId).done(function($container) {
								// XXX workaround to avoid first-child happen on call button in the popover
								$container.siblings(".btn").each(function() {
									var $s = $(this);
									if (!$s.hasClass("callButtonSibling")) {
										$s.addClass("callButtonSibling");										
									}
								});
								$container.prepend($("<div class='btn' style='display: none;'></div>"));
							});
						}
					} else {
						log("<< initSpacePopups WARN popover profileName link not found");
					}
				}, 300);
			};
			// XXX wait for loading activity stream (TODO try rely on a promise)
			setTimeout(function() {
				$("#" + compId).find(".author>.spaceName, .author>.owner").find("a.space-avatar[href*='\\/g/:spaces:']").each(function() {
					var $a = $(this);
					$a.mouseenter(function() {
						customizePopover();
					});
				});
			}, 1000);
		};
		
		var initSpace = function() {
			if (currentSpaceId) {
				var $navigationPortlet = $("#UIBreadCrumbsNavigationPortlet");
				if ($navigationPortlet.length == 0) {
					setTimeout($.proxy(initSpace, this), 250);
					return;
				}
				
				var $breadcumbEntry = $navigationPortlet.find(".breadcumbEntry");
				
				var addSpaceCallButton = function() {
					var initializer = addCallButton($breadcumbEntry, spaceContext(currentSpaceId));
					initializer.done(function($container) {
						var $button = $container.find(".startCallButton");
						$button.addClass("spaceCall");
						var $first = $button.first();
						var $dropdown = $first.siblings(".dropdown-toggle");
						var $hover = $();
						if ($first.hasClass("transparentButton")) {
							if ($dropdown.length == 1) {
								$hover = $hover.add($dropdown);							
							}
						} else {
							$first.addClass("transparentButton");
							$hover = $hover.add($first).add($dropdown);
						}
						$hover.hover(function() {
							$first.removeClass("transparentButton");
						}, function() {
							$first.addClass("transparentButton");
						});						
						log("<< initSpace DONE " + currentSpaceId + " for " + currentUser.id);
					});
					initializer.fail(function(error) {
						log("<< initSpace ERROR " + currentSpaceId + " for " + currentUser.id + ": " + error);
					});
				};
				
				// XXX if Chat found, ensure Call button added after it to respect its CSS
				if (chatBundleData || $("#chat-status").length > 0) {
					var waitAttempts = 0;
					var waitAndAdd = function() {
						waitAttempts++;
						setTimeout(function() {
							var $chatButton = $breadcumbEntry.children(".chat-button");
							if ($chatButton.length == 0 && waitAttempts < 40) { // wait max 2 sec
								log(">>> Chat button not found in space breadcumb");
								waitAndAdd();
							} else {
								addSpaceCallButton();								
							}
						}, 50);						
					};
					waitAndAdd();
				} else {
					addSpaceCallButton();
				}
			}
		};
		
		this.update = function(compId) {
			if (!compId) {
				// by default we work with whole portal page
				compId = "UIPortalApplication";
			}
			if (currentUser) { 
				initUserPopups(compId);
				initSpacePopups(compId);
				initSpace();
				initChat();
			}
		};

		/**
		 * Initialize context
		 */
		this.init = function(user, context) {
			if (user) {
				currentUser = user;
				prepareUser(currentUser);
				log("User initialized in Web Conferencing: " + user.id + ". ");
				if (context.spaceId) {
					currentSpaceId = context.spaceId;
				} else {
					currentSpaceId = null;
				}
				if (context.roomTitle) {
					currentRoomTitle = context.roomTitle;
				} else {
					currentRoomTitle = null; 
				}
				
				// init CometD connectivity
				if (context.cometdPath) {
					cCometD.configure({
						"url": prefixUrl  + context.cometdPath,
						"exoId": user.id,
						"exoToken": context.cometdToken,
						"maxNetworkDelay" : 15000
					});
					cometd = cCometD;
					cometdContext = {
						"exoContainerName" : context.containerName
					};
					cometd.onListenerException = function(exception, subscriptionHandle, isListener, message) {
				    // Uh-oh, something went wrong, disable this listener/subscriber
				    // Object "this" points to the CometD object
						log("< CometD listener exception: " + exception + " (" + subscriptionHandle + ") isListener:" + isListener + " message:" + message);
				    if (isListener) {
				        this.removeListener(subscriptionHandle);
				    } else {
				        this.unsubscribe(subscriptionHandle);
				    }
					}
				} else {
					log("WARN: CometD not found in context settings");
				}
				
				// also init registered providers
				for (var i = 0; i < providers.length; i++) {
					var p = providers[i];
					if (!p.isInitialized) {
						initProvider(p);
					}
				}
			}
		};
		
		this.getUser = function() {
			return currentUser;
		};
		
		this.getCurrentSpaceId = function() {
			return currentSpaceId;
		};
		
		this.getCurrentRoomTitle = function() {
			return currentRoomTitle;
		};
		
		this.getBaseUrl = function() {
			return pageBaseUrl();
		};
		
		/**
		 * Add provider to the scope.
		 */
		this.addProvider = function(provider) {
			// A Provider should support set of API methods:
			// * getType() - major call type name
			// * getSupportedTypes() - all supported call types
			// * getTitle() - human-readable title for UI
			// * callButton(context) - provider should offer an implementation of a Call button and call invoker in it, 
			// it returns a promise, when it resolved there will be a JQuery element of a button(s) container. 
			//
			// A provider may support following of API methods:
			// * init() - will be called when web conferencing user will be initialized in this.init(), this method returns a promise
			
			// TODO avoid duplicates, use map like?
			if (provider.getSupportedTypes && provider.hasOwnProperty("getSupportedTypes") && provider.getTitle && provider.hasOwnProperty("getTitle")) {
				if (provider.callButton && provider.hasOwnProperty("callButton")) {
					// we'll also care about providers added after Web Conferencing initialization, see this.init()
					providers.push(provider);
					log("Added call provider: " + provider.getType() + " (" + provider.getTitle() + ")");
					if (currentUser) {
						if (!provider.isInitialized) {
							initProvider(provider).fail(function() {
								// Provider failed to init, remove it from the working list
								var index = providers.indexOf(provider);
								if (index >= 0) {
							    array.splice(index, 1);
								}
							});
						} else {
							log("Already initialized provider: " + provider.getType());
						}
					} else {
						log("Current user not set, later will try initialized provider: " + provider.getType());
					}
				} else {
					log("Not compartible provider object (method callButton() required): " + provider.getTitle());
				}
			} else {
				log("Not a provider object: " + JSON.stringify(provider));
			}
		};
		
		/**
		 * Return registered provider by its type name.
		 */
		this.getProvider = function(type) {
			// TODO use more fast way with object-map?
			for (var i = 0; i < providers.length; i++) {
				var p = providers[i];
				var ptypes = p.getSupportedTypes();
				for (var ti = 0; ti < ptypes.length; ti++) {
					if (ptypes[ti] === type) {
						return p;
					}					
				}
			}
		};
		
		/**
		 * Add style to current document (to the end of head).
		 */
		this.loadStyle = function(cssUrl) {
			if (document.createStyleSheet) {
				document.createStyleSheet(cssUrl); // IE way
			} else {
				if ($("head").find("link[href='"+cssUrl+"']").length == 0) {
					var headElems = document.getElementsByTagName("head");
					var style = document.createElement("link");
					style.type = "text/css";
					style.rel = "stylesheet";
					style.href = cssUrl;
					headElems[headElems.length - 1].appendChild(style);
					// $("head").append($("<link href='" + cssUrl + "' rel='stylesheet' type='text/css' />"));
				} // else, already added
			}
		};
		
		/**
		 * Helper method to show call popup according the Web Conferencing spec.
		 */
		this.showCallPopup = function(url, name) {
			// FYI Core adopted from Video Calls v1 notif.js
			var aw = window.screen.availWidth; // screen.width
			var ah = window.screen.availHeight; // screen.height
			var w, h, top, left;
			if (aw > 760) {
				w = Math.floor(aw * 0.8);
			  h = Math.floor(ah * 0.8);
			  left = (aw/2)-(w/2);
			  top = (ah/2)-(h/2);	
			} else {
				w = aw;
			  h = ah;
			  left = 0;
			  top = 0;
			}
		  var callWindow = window.open(url, name, "toolbar=no,menubar=no,scrollbars=no,resizable=no,location=no,directories=no,status=no,"
		  			+ "width=" + w + ",height=" + h + ",top=" + top + ",left=" + left);
		  if (callWindow) {
		  	callWindow.focus();
		  }
		  return callWindow;
		};
		
		/** 
		 * Helper method to obtain the user IM account of given type.
		 */
		this.imAccount = function(user, type) {
			var ims = user.imAccounts[type];
			if (ims && ims.length > 0) {
				// TODO work with multiple IMs of same type
				return ims[0]; 
			} else {
				return null;
			}
		};
		
		this.showWarn = function(title, text, onInit) {
			showWarn(title, text, onInit);
		};
		
		this.showWarnBar = function(title, text, onInit) {
			showWarnBar(title, text, onInit);
		};
		
		this.showError = function(title, text, onInit) {
			showError(title, text, onInit);
		};
		
		this.showInfo = function(title, text, onInit) {
			showInfo(title, text, onInit);
		};

		this.getUserInfo = getUserInfoReq; 
		this.getSpaceInfo = getSpaceInfoReq;
		this.getRoomInfo = getRoomInfoReq;
		
		var tryParseJson = function(message) {
			var src = message.data ? message.data : (message.error ? message.error : message.failure); 
			if (src) {
				try {
					return typeof src == "string" ? JSON.parse(src) : src;
				} catch(e) {
					log("> Error parsing '" + src + "' as JSON: " + e, e);
					return src;
				}				
			} else {
				return src;
			}
		};
		
		var cometdError = function(response) {
			return "[" + response.id + "] " + response.channel + " " 
					+ JSON.stringify(response.error ? response.error : (response.failure ? response.failure : response.data));
		};
		
		var cometdInfo = function(response) {
			return "[" + response.id + "] " + response.channel;
		};
		
		/**
		 * Get registered call from server side database.
		 */
		this.getCall = function(id) {
			if (cometd) {
				log(">> getCall:/videocalls/calls:" + id + " - request published");
				var process = $.Deferred();
				var callProps = cometdParams({
					command : "get",
					id : id
				});
				cometd.remoteCall("/videocalls/calls", callProps, function(response) {
					if (response.successful) {
						var result = tryParseJson(response);
						log("<< getCall:/videocalls/calls:" + id + " - success: " + cometdInfo(response));
					  process.resolve(result, 200);
					} else {
						log("<< getCall:/videocalls/calls:" + id + " - failure: " + cometdError(response));
						process.reject(result, 400);
					}
				});
				return process.promise();
			} else {
				return getCallInfo(id);
			}
		};
		
		/**
		 * Update call state in server side database.
		 */
		this.updateCall = function(id, state) {
			if (cometd) {
				log(">> updateCall:/videocalls/calls:" + id + " - request published");
				var process = $.Deferred();
				var callProps = cometdParams({
					command : "update",
					id : id,
					state : state
				});
				cometd.remoteCall("/videocalls/calls", callProps, function(response) {
					var result = tryParseJson(response);
					if (response.successful) {
						log("<< updateCall:/videocalls/calls:" + id + " - success: " + cometdInfo(response));
					  process.resolve(result, 200);
					} else {
						log("<< updateCall:/videocalls/calls:" + id + " - failure: " + cometdError(response));
						process.reject(result, 400);
					}
				});
				return process.promise();
			} else {
				return putCallInfo(id, state);
			}
		};
		
		/**
		 * Remove call in server side database.
		 */
		this.deleteCall = function(id) {
			if (cometd) {
				log(">> deleteCall:/videocalls/calls:" + id + " - request published");
				var process = $.Deferred();
				var callProps = cometdParams({
					command : "delete",
					id : id
				});
				cometd.remoteCall("/videocalls/calls", callProps, function(response) {
					var result = tryParseJson(response);
					if (response.successful) {
						log("<< deleteCall:/videocalls/calls:" + id + " - success: " + cometdInfo(response));
					  process.resolve(result, 200);
					} else {
						log("<< deleteCall:/videocalls/calls:" + id + " - failure: " + cometdError(response));
						process.reject(result, 400);
					}
				});
				return process.promise();
			} else {
				return deleteCallInfo(id);
			}
		};
		
		/**
		 * Register call in server side database.
		 */
		this.addCall = function(id, callInfo) {
			if (cometd) {
				log(">> addCall:/videocalls/calls:" + id + " - request published");
				var process = $.Deferred();
				var callProps = cometdParams($.extend(callInfo, {
					command : "create",
					id : id
				}));
				cometd.remoteCall("/videocalls/calls", callProps, function(response) {
					var result = tryParseJson(response);
					if (response.successful) {
						log("<< addCall:/videocalls/calls:" + id + " - success: " + cometdInfo(response));
					  process.resolve(result, 200);
					} else {
						log("<< addCall:/videocalls/calls:" + id + " - failure: " + cometdError(response));
						process.reject(result, 400);
					}
				});
				return process.promise();
			} else {
				return postCallInfo(id, callInfo);
			}
		};
		
		this.getUserGroupCalls = function() {
			if (cometd) {
				log(">> getUserGroupCalls:/videocalls/calls - request published");
				var process = $.Deferred();
				var callProps = cometdParams({
					id : "me", // an user ID, 'me' means current user in eXo
					command : "get_calls_state"
				});
				cometd.remoteCall("/videocalls/calls", callProps, function(response) {
					var result = tryParseJson(response);
					if (response.successful) {
						log("<< getUserGroupCalls:/videocalls/calls - success: " + cometdInfo(response));
					  process.resolve(result, 200);
					} else {
						log("<< getUserGroupCalls:/videocalls/calls - failure: " + cometdError(response));
						process.reject(result, 400);
					}
				});
				return process.promise();
			} else {
				return getUserCallsState();
			}
		}
		
		this.updateUserCall = function(id, state) {
			if (cometd) {
				// It's the same channel to call in CometD
				return this.updateCall(id, state);
			} else {
				return putUserCallState(id, state);
			}
		}
		
		//this.addUserGroupCall = postUserCallId;
		//this.removeUserGroupCall = deleteUserCallId; // TODO not used
		
		this.onUserUpdate = function(userId, onUpdate, onError) {
			if (cometd) {
				// /service/videocalls/calls
				var subscription = cometd.subscribe("/eXo/Application/VideoCalls/user/" + userId, function(message) {
					// Channel message handler
					var result = tryParseJson(message);
					if (message.data.error) {
						if (typeof onError == "function") {
							onError(result, 400);
						}
					} else {
						if (typeof onUpdate == "function") {
							onUpdate(result, 200);
						}							
					}
				}, function(subscribeReply) {
					// Subscription status callback
					if (subscribeReply.successful) {
		        // The server successfully subscribed this client to the channel.
						log("<< User updates subscribed successfully: " + JSON.stringify(subscribeReply));
					} else {
						var err = subscribeReply.error ? subscribeReply.error : (subscribeReply.failure ? subscribeReply.failure.reason : "Undefined");
						log("<< User updates subscription failed: " + err);
						if (typeof onError == "function") {
							onError("User updates subscription failed (" + err + ")", 0);								
						}
					}
				});
				return {
					off : function(callback) {
						cometd.unsubscribe(subscription, callback);
					}
				};
			} else {
				var loop = true;
				var poll = function(prevData, prevStatus) {
					if (loop) {
						var timeout = prevStatus == 0 ? 60000 : (prevStatus >= 400 ? 15000 : 250);
						setTimeout(function() {
							pollUserUpdates(userId).done(function(update, status) {
								if (typeof onUpdate == "function") {
									onUpdate(update, status);								
								}
							}).fail(function(err, status) {
								if (typeof onError == "function") {
									onError(err, status);								
								}
							}).always(poll);
						}, timeout);						
					}
				};
				poll();
				return {
					off : function(callback) {
						loop = false;
						if (typeof callback == "function") {
							callback();
						}
					}
				};
			}
		};
		
		this.onCallUpdate = function(callId, onUpdate, onError) {
			if (cometd) {
				var subscription = cometd.subscribe("/eXo/Application/VideoCalls/call/" + callId, function(message) {
					// Channel message handler
					var result = tryParseJson(message);
					if (message.data.error) {
						if (typeof onError == "function") {
							onError(result, 400);
						}
					} else {
						if (typeof onUpdate == "function") {
							onUpdate(result, 200);
						}							
					}
				}, function(subscribeReply) {
					// Subscription status callback
					if (subscribeReply.successful) {
		        // The server successfully subscribed this client to the channel.
						log("<< Call updates subscribed successfully: " + JSON.stringify(subscribeReply));
					} else {
						var err = subscribeReply.error ? subscribeReply.error : (subscribeReply.failure ? subscribeReply.failure.reason : "Undefined");
						log("<< Call updates subscription failed: " + err);
						if (typeof onError == "function") {
							onError("Call updates subscription failed (" + err + ")", 0);								
						}
					}
				});
				return {
					off : function(callback) {
						cometd.unsubscribe(subscription, callback);
					}
				};
			} else {
				log("ERROR: Call updates require CometD");
				return {
					off : function() {}
				}
			}
		};
				
		this.toCallUpdate = function(callId, data) {
			var process = $.Deferred();
			if (cometd) {
				cometd.publish("/eXo/Application/VideoCalls/call/" + callId, data, function(publishAck) {
			    if (publishAck.successful) {
			    	log("<< Call update reached the server: " + JSON.stringify(publishAck));
			    	process.resolve("successful", 200);
			    } else {
			    	log("<< Call update failed to reach the server: " + JSON.stringify(publishAck));
			    	process.reject(publishAck.failure ? publishAck.failure.reason : publishAck.error, 500);
			    }
				});
			} else {
				log("ERROR: Call updates require CometD");
				process.reject("CometD required", 400);
			}
			return process.promise();
		};
	}
	
	var webConferencing = new WebConferencing();
	
	// Register webConferencing in global eXo namespace (for non AMD uses)
	if (typeof window.eXo === "undefined" || !eXo) {
		window.eXo = {};
	}
	if (typeof eXo.webConferencing === "undefined" || !eXo.webConferencing) {
		eXo.webConferencing = webConferencing;
	} else {
		log("eXo.webConferencing already defined");
	}
	
	$(function() {
		try {
			// Init notification styles
			// configure Pnotify: use jQuery UI css
			$.pnotify.defaults.styling = "jqueryui";
			// no history roller in the right corner
			$.pnotify.defaults.history = false;
			
			// Load common styles here - it's common CSS for all skins so far.
			webConferencing.loadStyle("/videocalls/skin/jquery-ui.min.css");
			webConferencing.loadStyle("/videocalls/skin/jquery-ui.structure.min.css");
			webConferencing.loadStyle("/videocalls/skin/jquery-ui.theme.min.css");
			webConferencing.loadStyle("/videocalls/skin/jquery.pnotify.default.css");
			webConferencing.loadStyle("/videocalls/skin/jquery.pnotify.default.icons.css");
			//webConferencing.loadStyle("/videocalls/skin/videocalls.css"); // this CSS will be loaded as portlet skin
			// FYI eXo.env.client.skin contains skin name, it can be consulted to load a specific CSS
		} catch(e) {
			log("Error configuring Web Conferencing notifications.", e);
		}
	});

	log("< Loaded at " + location.origin + location.pathname + " -- " + new Date().toLocaleString());
	
	return webConferencing;
})($, cCometD);
