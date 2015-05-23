"use strict"
class Chat {

    constructor()
    {
        this.namecolors = ["#ff0000", "#0000ff", "#008000", "#b22222", "#ff7f50", "#9acd32", "#ff4500", "#2e8b57", "#daa520", "#d2691e", "#5f9ea0", "#1e90ff", "#ff6984"];

        this.pausescroll = false;
        this.emoticons = [];
        this.emotesets = [];
        this.chatters = {};
        this.messageid = 0;
        this.channel;
        this.ws;
        this.lastmessagebeforetab = "";

        this.localuser = {
            mod: [],
            username: "",
            user: ""
        };
        console.log(this);

        var self = this;

        $(".twitch-connect").hide();
        $("#channel-select").show();
        $("#channel-select-input").keyup(function (evt)
        {
            self.onChannelSelectKeyUp(evt);
        });
        $("#channel-select-button").click(function ()
        {
            self.onChannelSelectButtonClicked();
        });
    }

    get channel()
    {
        return document.getElementById("channel-select-input").value.toLowerCase();
    }

    onChannelSelectButtonClicked()
    {
        this.loadChat();
    }

    onChannelSelectKeyUp(evt)
    {
        var code = evt.keyCode || evt.which;
        if (code == 13)
        {
            console.log(this);
            this.loadChat();
        }
    }

    isLocalUserMod()
    {
        var nonmodbadges = 0;
        if (this.localuser.mod.indexOf("turbo") !== -1)++nonmodbadges;
        if (this.localuser.mod.indexOf("subscriber") !== -1)++nonmodbadges;
        if (this.localuser.mod.length > nonmodbadges)
        {
            return true;
        }
        else
        {
            return false;
        }
    }

    loadChat()
    {
        $("#channel-select").hide();
        $("#everything").show();
        this.sendToFeed({ badges: [], message: "Connecting..." });
        this.sendToFeed({ badges: [], message: "Do NOT share the access_token in the page URL!" });
        window.history.pushState(null, null, "chat/");

        var self = this;

        Twitch.api({ method: "" }, function (error, data) { self.onApiLoad(error, data) });

        this.registerEventHandlers();
    }

    onApiLoad(error, data)
    {
        if (error)
        {
            alert(error);
            return;
        }

        if (!data.token.valid)
        {
            Twitch.login({
                scope: ["chat_login"]
            });
        }

        console.log(data);

        console.log(this);

        this.localuser.username = data.token.user_name;

        Twitch.api({ method: "chat/" + this.channel + "/badges" }, function (error, data)
        {
            if (error)
            {
                console.log(error);
            }
            else if (data.subscriber !== null && typeof data.subscriber !== "undefined" && data.subscriber.image !== null && typeof data.subscriber.image !== "undefined")
                $("#subscriber-icon").html("span.subscriber { background: transparent url(" + data.subscriber.image.replace("http:", "https:") + "); background-size: 100%; }");
        });

        var self = this;

        this.ws = new WebSocket("wss://i.3v.fi:8016/");
        this.ws.onopen = function (event)
        {
            self.onWsOpen(event, data);
        }
        this.ws.onmessage = function (event)
        {
            self.onWsMessage(event);
        }
        this.ws.onerror = function (event)
        {
            console.error(event);
        }
        this.ws.onclose = function (event)
        {
            self.onWsClose(event);
        }
    }

    onWsOpen(event, data)
    {
        console.log(this);
        this.sendToFeed({ badges: [], message: "Connected!" });
        this.ws.send(JSON.stringify({
            user: data.token.user_name,
            token: "oauth:" + Twitch.getToken(),
            channel: this.channel
        }));
    }

    onWsMessage(event)
    {
        var data = JSON.parse(event.data);

        if (typeof data.systemMsg !== "undefined")
        {
            sendToFeed({ badges: [], message: data.systemMsg });
            return;
        }

        console.log(data);

        switch (data.command)
        {
            case "USERSTATE":
                var badges = [];
                var modFound = false;
                if (typeof data.tags.emotesets === "string")
                {
                    if (typeof this.emoticons === "undefined" || this.emoticons.length == 0)
                    {
                        let self = this;
                        Twitch.api({ method: "chat/emoticon_images", params: { emotesets: data.tags.emotesets } }, function (error, data)
                        {
                            self.onEmotesLoad(error, data);
                        });
                    }
                    this.emotesets = data.tags.emotesets.split(',');
                    for (var i = 0; i < this.emotesets.length; i++)
                    {
                        this.emotesets[i] = parseInt(this.emotesets[i]);
                    }

                }
                if (typeof data.tags["user-type"] === "string")
                {
                    badges.push(data.tags["user-type"]);
                    modFound = true;
                }
                else if (this.channel == this.localuser.username)
                {
                    badges.push("broadcaster");
                }
                if (data.tags.subscriber == "1")
                {
                    badges.push("subscriber");
                }
                if (data.tags.turbo == "1")
                {
                    badges.push("turbo");
                }
                this.localuser.mod = badges;

                var hex = data.tags.color;
                if (typeof hex !== "string" || hex[0] !== '#') hex = this.namecolors[getRandomInt(0, this.namecolors.length)];
                var rgb = hexToRgb(hex);
                if (rgb.r + rgb.g + rgb.b < 150)
                {
                    var red = Math.floor((rgb.r + 30) * 2);
                    var green = Math.floor((rgb.g + 30) * 2);
                    var blue = Math.floor((rgb.b + 30) * 2);
                    console.log("New", red, green, blue);
                    hex = rgbToHex(
                        Math.min(255, red),
                        Math.min(255, green),
                        Math.min(255, blue));
                    console.log(hex);
                }
                this.localuser.namecolor = hex;
                this.localuser.user = '<span class="user" style="color:' + hex + '">' + this.localuser.username + '</span>';
                break;
            case "PRIVMSG":
                {
                    var message = data.params[1];
                    var user = typeof data.tags["display-name"] == "string" ? data.tags["display-name"].replace('\\s', ' ').replace('\\:', ';').replace('\\\\', '\\').replace('\\r', '').replace('\\n', '\u23CE') : data.prefix.split('!')[0];
                    var displayName = user;
                    var rawuser = data.prefix.split('!')[0];
                    var namecolor;
                    var badges = [];
                    this.messageid++;
                    this.chatters[displayName]=Math.max(this.chatters[displayName]||0,this.messageid);

                    if (user == "jtv")
                    {
                        if (message.match(/^(?:USERCOLOR|SPECIALUSER|EMOTESET|CLEARCHAT|HOSTTARGET)/))
                            return;
                        else if (message.indexOf("now in slow") > -1)
                            $("#slow").text(message.split(' ')[12]).animate({ "background-color": "#0F0" }, 200);
                        else if (message.indexOf("no longer in slow") > -1)
                            $("#slow").text("0").animate({ "background-color": "transparent" }, 200);
                        else if (message.indexOf("now in subscribers") > -1)
                            $("#submode").text("ON").animate({ "background-color": "#0F0" }, 200);
                        else if (message.indexOf("no longer in subscribers") > -1)
                            $("#submode").text("OFF").animate({ "background-color": "transparent" }, 200);
                        else if (message.indexOf("now in r9k") > -1)
                            $("#r9k").text("ON").animate({ "background-color": "#0F0" }, 200);
                        else if (message.indexOf("no longer in r9k") > -1)
                            $("#r9k").text("OFF").animate({ "background-color": "transparent" }, 200);
                    }

                    if (this.channel == rawuser)
                    {
                        badges.push("broadcaster");
                    }
                    else if (typeof data.tags["user-type"] === "string")
                    {
                        badges.push(data.tags["user-type"]);
                    }
                    if (data.tags.subscriber == "1")
                    {
                        badges.push("subscriber");
                    }
                    if (data.tags.turbo == "1")
                    {
                        badges.push("turbo");
                    }

                    var hex = data.tags.color;
                    if (typeof hex !== "string" || hex[0] !== '#') hex = this.namecolors[rawuser.charCodeAt(0) % this.namecolors.length];
                    var rgb = hexToRgb(hex);
                    if (rgb.r + rgb.g + rgb.b < 150 || rgb.g < rgb.b / 2)
                    {
                        var red = Math.floor((rgb.r + 40) * 2);
                        var green = Math.floor((rgb.g + 40) * 2);
                        var blue = Math.floor((rgb.b + 40) * 2);
                        console.log("New", red, green, blue);
                        hex = rgbToHex(
                            Math.min(255, red),
                            Math.min(255, green),
                            Math.min(255, blue));
                        console.log(hex);
                    }
                    namecolor = hex;
                    user = '<span class="user" style="color:' + hex + '" data-name="' + user + '">' + user + '</span>';

                    var isAction = false;
                    if (message[0] === '\u0001')
                    {
                        message = message.replace('\u0001ACTION ', '').replace('\u0001', '');
                        isAction = true;
                    }

                    if (typeof data.tags.emotes === "string")
                    {
                        message = message.replace(/[\uD000-\uDFFF]/g, "\uFFFD");

                        var differentEmotes = data.tags.emotes.split('/');
                        var replacementData = [];
                        for (var i = 0; i < differentEmotes.length; i++)
                        {
                            var emoteData = differentEmotes[i].split(':');
                            var ranges = emoteData[1].split(',');
                            for (var j = 0; j < ranges.length; j++)
                            {
                                var range = ranges[j].split('-');
                                replacementData.push([parseInt(range[0]), parseInt(range[1]), emoteData[0]]);
                            }
                        }
                        replacementData.sort(function (x, y)
                        {
                            if (x[0] > y[0]) return -1;
                            if (x[0] < y[0]) return 1;
                            return 0;
                        });
                        var normalText = [];
                        var lastStartIndex = message.length;
                        for (var i = 0; i < replacementData.length; i++)
                        {
                            normalText.push(message.substring(replacementData[i][1] + 1, lastStartIndex));
                            lastStartIndex = replacementData[i][0];
                            message = replaceFromTo(message, '</span><img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v1/' + replacementData[i][2] + '/1.0" alt="' + message.substring(replacementData[i][0], replacementData[i][1] + 1) + '" /><span class="normal">', replacementData[i][0], replacementData[i][1]);
                        }
                        normalText.push(message.substring(0, lastStartIndex));

                        for (var i = normalText.length - 1; i >= 0; i--)
                        {
                            if (normalText[i].length > 0)
                            {
                                var links = {};
                                var linkid = 0xE000;
                                var text = $('<div/>').text(normalText[i]).html()
                                    .replace(/(?:[Hh][Tt]{2}[Pp][Ss]?:\/\/)?(?:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\.)+[A-Za-z]{2,}(?:\/[\w\d._~!$&'\(\)*+,;=:@\/#?%-]+)?/g, 
                                        function(m)
                                        {
                                            links[++linkid] = '<a href="'+m+'" target="_blank">'+m+'</a>';
                                            return String.fromCharCode(linkid);
                                        });
                                var oldtext = text;
                                message = message.replace(new RegExp(this.localuser.username,"i"), function(m){return '<span class="highlight">' + m + '</span>'});
                                if(oldtext != text)
                                {
                                    // found a highlight
                                    this.chatters[displayName]=Math.max(this.chatters[displayName]||0,this.messageid+200);
                                }
                                text = text.replace(/[\uE000-\uF800]/g,function(x){return links[x.charCodeAt(0)];});
                                message = message.replace(normalText[i], text);
                            }
                        }
                    }
                    else
                    {
                        var links = {};
                        var linkid = 0xE000;
                        message = $('<div/>').text(message).html()
                                .replace(/((?:[Hh][Tt]{2}[Pp][Ss]?:\/\/)?(?:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\.)+[A-Za-z]{2,}(?:\/[\w\d._~!$&'\(\)*+,;=:@\/#?%-]+)?)/g, 
                                    function(m)
                                    {
                                        links[++linkid] = '<a href="'+m+'" target="_blank">'+m+'</a>';
                                        return String.fromCharCode(linkid);
                                    });
                        var oldmessage = message;
                        message = message.replace(new RegExp(this.localuser.username,"i"), function(m){return '<span class="highlight">' + m + '</span>'});
                        if(oldmessage != message)
                        {
                            // found a highlight
                            this.chatters[displayName]=Math.max(this.chatters[displayName]||0,this.messageid+200);
                        }
                        message = message.replace(/[\uE000-\uF800]/g,function(x){return links[x.charCodeAt(0)];});
                    }
                    if (isAction)
                    {
                        message = '<span class="action" style="color:' + namecolor + '">' + message + '</span>';
                    }
                    if (rawuser === "jtv" || rawuser === "twitchnotify")
                    {
                        user = "";
                        rawuser = "";
                    }

                    this.sendToFeed({ badges: badges, user: user, message: message, rawuser: rawuser });

                    var links = $('#messages a');
                    for (var i = 0; i < links.length; i++)
                    {
                        var attr = $(links[i]).attr('href');
                        if (!attr.startsWith("http://") && !attr.startsWith("https://"))
                        {
                            $(links[i]).attr('href', 'http://' + attr);
                        }
                    }
                }
                break;
            case "CLEARCHAT":
                {
                    if (data.params.length > 1)
                    {
                        console.log(data.params);
                        $('.line[data-user=' + data.params[1] + ']').css('text-decoration', 'line-through').css('color', '#44485F');
                        $('.line[data-user=' + data.params[1] + '] > span.user').css('color', '#44485F');
                        $('.line[data-user=' + data.params[1] + '] img').css('opacity', '0.7');
                    }
                    else
                    {
                        if (this.isLocalUserMod())
                        {
                            this.sendToFeed({ badges: [], message: "Chat cleared by another moderator, but prevented for you because of your moderation powers." });
                        }
                        else
                        {
                            $('#messages').html('');
                            this.sendToFeed({ badges: [], message: "Chat cleared by a moderator." });
                        }
                    }
                }
                break;
        }
    }

    onWsClose(event)
    {
        console.log(event);
        this.sendToFeed({ badges: [], message: "Disconnected!" });
    }

    onEmotesLoad(error, data)
    {
        console.log("Emoticons");
        if (error) console.log(error);
        else
        {
            this.emoticons = [];
            var regexes = [];
            for (var emoteset in data.emoticon_sets)
            {
                if (data.emoticon_sets.hasOwnProperty(emoteset))
                {
                    for (var i = 0; i < data.emoticon_sets[emoteset].length; i++)
                    {
                        var re = '(?:\s|^)(' + data.emoticon_sets[emoteset][i].code + ')(?:\s|$)';
                        var idx = regexes.indexOf(re);
                        if (idx === -1)
                        {
                            regexes.push(re);

                            data.emoticon_sets[emoteset][i].code = new RegExp(re, 'g');
                            this.emoticons.push(data.emoticon_sets[emoteset][i]);
                        }
                        else
                        {
                            this.emoticons[idx].id = data.emoticon_sets[emoteset][i].id;
                        }
                    }
                }
            }
            //emoticons.reverse();
        }
    }

    registerEventHandlers()
    {
        var self = this;
        $('#messages').on('click', "span.modicon", function (evt)
        {
            self.onModIconClicked(this);
        });
        $('#messages').on('mouseover', "span.user", function ()
        {
            $('#messages span.user[data-name=' + $(this).attr('data-name') + ']').parent().css("background-color", "#000");
        });
        $('#messages').on('mouseleave', "span.user", function ()
        {
            $('#messages span.user[data-name=' + $(this).attr('data-name') + ']').parent().css("background-color", "transparent");
        });
        $('#messages').on('mouseover', "img", function ()
        {
            var pos = $(this).offset();
            $("#emote-label").text($(this).attr("alt"));
            $("#emote-label").css("left", pos.left).css("top", pos.top + 30).show();
        });
        $('#messages').on('mouseleave', "img", function ()
        {
            $("#emote-label").hide();
        });
        $("#messaging-input").keydown(function (evt)
        {
            self.messagingInputKeyDown(evt, this);
        });
        $("#messaging-input").tabcomplete({collection: function(w)
        {
            var coll = [];
            for(var u in self.chatters)
            {
                if(u!="jtv" && u.toLowerCase().replace(" ","").indexOf(w.toLowerCase())==0)coll.push(u);
            }
            coll.sort(function(a,b){return self.chatters[b]-self.chatters[a];});
            return coll;
        }});
    }

    onModIconClicked(self)
    {
        var user = $(self).parent().attr("data-user");
        var msg = "/timeout " + user + " 600";
        if ($(self).hasClass("t3600"))
        {
            msg = "/timeout " + user + " 3600";
	}
	else if ($(self).hasClass("t1"))
        {
            msg = "/timeout " + user + " 1";
        }
        else if ($(self).hasClass("tperm"))
        {
            msg = "/ban " + user;
        }
        this.ws.send(JSON.stringify({ channel: this.channel, message: msg }));
    }

    messagingInputKeyDown(evt, self)
    {
        var code = evt.keyCode || evt.which;
        if (code == 13)
        {
            evt.preventDefault();
            var message = $(self).val();
            this.ws.send(JSON.stringify({ channel: this.channel, message: message }));

            if (message.startsWith("/") || message.startsWith("."))
            {
                this.sendToFeed({ badges: [], message: "Command sent: " + message });
                $(self).val("");
                return;
            }

            message = $('<div/>').text(message).html()
                                .replace(/((?:[Hh][Tt]{2}[Pp][Ss]?:\/\/)?(?:[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\.)+[A-Za-z]{2,}(?:\/[\w\d._~!$&'\(\)*+,;=:@\/#?%-]+)?)/g, '<a href="$1" target="_blank">$1</a>');

            // Check message for emotes
            if (typeof this.emoticons !== "undefined")
            {
                for (var i = 0; i < this.emoticons.length; i++)
                {
                    message = message.replace(this.emoticons[i].code, '<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v1/' + this.emoticons[i].id + '/1.0" alt="$1" />');
                }
            }

            this.sendToFeed({ badges: this.localuser.mod, user: this.localuser.user, message: message, rawuser: this.localuser.username });
            $(self).val("");
        }
    }

    sendToFeed(data)
    {
        var element = $('#messages');
        var badges = "";
        var modicons = "";
        var modFound = false;
        for (var i = 0; i < data.badges.length; i++)
        {
            badges += '<span class="badge ' + data.badges[i] + '"></span>';
            if (data.badges[i] !== "subscriber" && data.badges[i] !== "turbo") modFound = true;
        }
        if (this.isLocalUserMod() && !modFound)
        {
            modicons = '<span class="modicon t1"><img src="https://dl.dropboxusercontent.com/u/13337387/assets/purge.png" alt="purge"/></span><span class="modicon t600"><img src="https://dl.dropboxusercontent.com/u/13337387/assets/timeout.png" alt="timeout" /></span><span class="modicon t3600">h</span><span class="modicon tperm"><img src="https://dl.dropboxusercontent.com/u/13337387/assets/ban.png" alt="ban" /></span> ';
        }
        var scrollCheck = element[0].scrollHeight - element.scrollTop() <= element.outerHeight() + 100;
        if (typeof data.user === "undefined" || data.user.length == 0)
        {
            element.append('<div class="line system">' + badges + data.message + '</div>');
        }
        else
        {
            element.append('<div class="line" data-user="' + data.rawuser + '">' + modicons + badges + data.user + ': <span class="normal">' + data.message + '</span></div>');
        }
        if (scrollCheck && !this.pausescroll)
        {
            while ($('.line').length > 200)
            {
                $('#messages .line').first().remove();
            }
            element.animate({ "scrollTop": element[0].scrollHeight }, 0);
        }
        while ($('.line').length > 2000)
        {
            $('#messages .line').first().remove();
        }
    }
}

$(document).ready(function ()
{
    var chat = {pausescroll: false};

    $(document).keydown(
        function (evt)
        {
            var code = evt.keyCode || evt.which;
            if (code == 17)
            {
                chat.pausescroll = true;
            }
        }
    );
    $(document).keyup(
        function (evt)
        {
            var code = evt.keyCode || evt.which;
            if (code == 17)
            {
                chat.pausescroll = false;
                var element = $('#messages');
                element.animate({ "scrollTop": element[0].scrollHeight }, 200);
            }
        }
    );

    Twitch.init({
        clientId: "j3vvbcm7kqfva3tb7c0i0joo583ttb6"
    }, function (error, status)
    {
        if (error) console.log(error);
        if (status.authenticated)
        {
            chat = new Chat();
        }
        else
        {
            Twitch.events.addListener("auth.login", function () {
                chat = new Chat();
            });
            $(".twitch-connect").click(function ()
            {
                Twitch.login({
                    scope: ["chat_login"]
                });
            });
        }
    });
});

function getRandomInt(min, max)
{
    return Math.floor(Math.random() * (max - min)) + min;
}

function replaceFromTo(str, replacement, from, to)
{
    return str.substring(0, from) + replacement + str.substring(to + 1, str.length);
}

// **********************************************

// The 3 functions below CC-by-SA http://stackoverflow.com/a/5624139/1780502 by http://stackoverflow.com/users/96100/tim-down
function hexToRgb(hex)
{
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}
function componentToHex(c)
{
    var hex = c.toString(16);
    return hex.length == 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b)
{
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

// **********************************************

// String.prototype.endsWith() (compatibility fix from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/endsWith)
// Contributors to the page: evilpie, Ripter, hsablonniere, mathiasbynens, fscholz, Sheppy, ziyunfei, lydell, ethertank, Mingun, Waldo, iOraelosi, NathanW
// Licensed under CC-by-SA
if (!String.prototype.endsWith)
{
    Object.defineProperty(String.prototype, 'endsWith', {
        value: function (searchString, position)
        {
            var subjectString = this.toString();
            if (position === undefined || position > subjectString.length)
            {
                position = subjectString.length;
            }
            position -= searchString.length;
            var lastIndex = subjectString.indexOf(searchString, position);
            return lastIndex !== -1 && lastIndex === position;
        }
    });
}

// String.prototype.startsWith() (compatibility fix from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/startsWith)
// Contributors to this page: evilpie, Sheppy, hsablonniere, fscholz, dbruant, ziyunfei, krennecke, mathiasbynens, ethertank, Mingun, Ripter, Exter-N, Havvy, Waldo, teoli, williamr, Scimonster
// Licensed under CC-by-SA
if (!String.prototype.startsWith)
{
    Object.defineProperty(String.prototype, 'startsWith', {
        enumerable: false,
        configurable: false,
        writable: false,
        value: function (searchString, position)
        {
            position = position || 0;
            return this.lastIndexOf(searchString, position) === position;
        }
    });
}

// **********************************************
