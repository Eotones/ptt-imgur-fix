// ==UserScript==
// @name        PTT Imgur Fix
// @description	修正 Imgur 在 PTT 上的問題
// @namespace   eight04.blogspot.com
// @include     https://www.ptt.cc/bbs/*.html
// @include     https://www.ptt.cc/man/*.html
// @version     0.5.1
// @author		eight
// @homepage	https://github.com/eight04/ptt-imgur-fix
// @supportURL	https://github.com/eight04/ptt-imgur-fix/issues
// @license		MIT
// @compatible	firefox
// @compatible	chrome
// @run-at		document-start
// @grant		GM_getValue
// @grant		GM_setValue
// @grant		GM_registerMenuCommand
// @grant       GM_xmlhttpRequest
// @require https://greasyfork.org/scripts/7212-gm-config-eight-s-version/code/GM_config%20(eight's%20version).js?version=156587
// @connect     imgur.com
// ==/UserScript==


// 程式碼修改自: PTT Imgur Fix
// 來源連結: https://greasyfork.org/zh-TW/scripts/28264-ptt-imgur-fix
// 來源版本: 0.5.1
// 來源作者: eight
// 來源license: MIT
// 說明: 將原始版本修改成ES6 Class版本(PttImgurFix),新增修改的內容寫在下方繼承的Class(newPttImgurFix)
class PttImgurFix {
    constructor(){
        this.VERSION = '0.5.1';

        /*
          global GM_config
          https://greasyfork.org/zh-TW/scripts/7212-gm-config-eight-s-version
        */
        GM_config.setup({
            embedYoutube: {
                label: "Embed youtube video",
                type: "checkbox",
                default: true
            },
            youtubeParameters: {
                label: "Youtube player parameters (e.g. rel=0&loop=1)",
                type: "text",
                default: ""
            },
            embedImage: {
                label: "Embed image",
                type: "checkbox",
                default: true
            },
            embedAlbum: {
                label: "Embed imgur album. The script would request imgur.com for album info",
                type: "checkbox",
                default: false
            },
            albumMaxSize: {
                label: "Maximum number of images to load for an album",
                type: "number",
                default: 5
            },
            lazyLoad: {
                label: "Don't load images until scrolled into view",
                type: "checkbox",
                default: true
            }
        }, () => {
            this.config = GM_config.get()
        });
    }

    embedLinks(){
        // remove old .richcontent
        let rich = document.querySelectorAll("#main-content .richcontent");
        for (let node of rich) {
            node.parentNode.removeChild(node);
        }

        // embed links
        let links = document.querySelectorAll("#main-content a");
        let processed = new Set();
        for (let link of links) {
            if (processed.has(link) || !this.getLinkInfo(link).embedable) {
                continue;
            }
            let [links_, lineEnd] = this.findLinksInSameLine(link);
            links_.forEach(l => processed.add(l));
            this.createRichContent(links_, lineEnd);
        }
    }

    findLinksInSameLine(node){
        let links = [];
        while (node) {
            if (node.nodeName == "A") {
                links.push(node);
                node = node.nextSibling || node.parentNode.nextSibling;
                continue;
            }

            if (node.nodeType == Node.TEXT_NODE && node.nodeValue.includes("\n")) {
                return [links, this.findLineEnd(node)];
            }

            if (node.childNodes.length) {
                node = node.childNodes[0];
                continue;
            }

            if (node.nextSibling) {
                node = node.nextSibling;
                continue;
            }

            if (node.parentNode.id != "main-content") {
                node = node.parentNode.nextSibling;
                continue;
            }

            throw new Error("Invalid article, missing new line?");
        }
    }

    findLineEnd(text){
        let index = text.nodeValue.indexOf("\n");
        if (index == text.nodeValue.length - 1) {
            while (text.parentNode.id != "main-content") {
                text = text.parentNode;
            }
            return text;
        }

        let pre = document.createTextNode("");
        pre.nodeValue = text.nodeValue.slice(0, index + 1);
        text.nodeValue = text.nodeValue.slice(index + 1);
        text.parentNode.insertBefore(pre, text);
        return pre;
    }

    createRichContent(links, ref){ // insert richcontent brefore ref.nextSibling
        // create our rich content
        for (let link of links) {
            let linkInfo = this.getLinkInfo(link);
            if (!linkInfo.embedable) {
                continue;
            }
            let richContent = document.createElement("div");
            richContent.className = "richcontent ptt-imgur-fix";
            const embed = this.createEmbed(linkInfo, richContent);
            if (typeof embed === "string") {
                richContent.innerHTML = embed;
            } else if (embed) {
                richContent.appendChild(embed);
            }
            const lazyTarget = richContent.querySelector("[data-src]");
            if (lazyTarget) {
                if (this.config.lazyLoad) {
                    this.setupLazyLoad(lazyTarget);
                } else {
                    lazyTarget.src = lazyTarget.dataset.src;
                }
            }

            ref.parentNode.insertBefore(richContent, ref.nextSibling);
            ref = richContent;
        }
    }

    setupLazyLoad(target){
        let observer = new IntersectionObserver(entries => {
            for (let entry of entries) {
                if (entry.isIntersecting) {
                    target.src = target.dataset.src;
                } else {
                    let {offsetWidth, offsetHeight} = target;
                    if (offsetWidth) {
                        target.style.width = offsetWidth + "px";
                        target.style.height = offsetHeight + "px";
                    }
                    target.src = "";
                }
            }
        });
        observer.observe(target);
    }

    getLinkInfo(link){
        return this.getUrlInfo(link.href);
    }

    getUrlInfo(url){
        let match;
        if ((match = url.match(/\/\/(?:[im]\.)?imgur\.com\/([a-z0-9]{2,})/i)) && match[1] != "gallery") {
            return {
                type: "imgur",
                id: match[1],
                url: url,
                embedable: this.config.embedImage
            };
        }
        if ((match = url.match(/\/\/(?:[im]\.)?imgur\.com\/(?:a|gallery)\/([a-z0-9]{2,})/i))) {
            return {
                type: "imgur-album",
                id: match[1],
                url: url,
                embedable: this.config.embedAlbum
            };
        }
        if ((match = url.match(/\/\/www\.youtube\.com\/watch?.*?v=([a-z0-9_-]{9,12})/i)) || (match = url.match(/\/\/(?:youtu\.be|www\.youtube\.com\/embed)\/([a-z0-9_-]{9,12})/i))) {
            return {
                type: "youtube",
                id: match[1],
                url: url,
                embedable: this.config.embedYoutube
            };
        }
        if ((match = url.match(/\/\/pbs\.twimg\.com\/media\/([a-z0-9_-]+\.(?:jpg|png))/i))) {
            return {
                type: "twitter",
                id: match[1],
                url: url,
                embedable: this.config.embedImage
            };
        }
        if ((match = url.match(/\/\/pbs\.twimg\.com\/media\/([a-z0-9_-]+)\?.*format=([\w]+)/i))) {
            return {
                type: "twitter",
                id: `${match[1]}.${match[2]}`,
                url: url,
                embedable: this.config.embedImage
            };
        }
        if (/^[^?#]+\.(?:jpg|png|gif|jpeg)(?:$|[?#])/i.test(url)) {
            return {
                type: "image",
                id: null,
                url: url,
                embedable: this.config.embedImage
            };
        }
        return {
            type: "url",
            id: null,
            url: url,
            embedable: false
        };
    }

    createEmbed(info, container){
        if (info.type == "imgur") {
            return `<img referrerpolicy="no-referrer" data-src="//i.imgur.com/${info.id}.jpg">`;
        }
        if (info.type == "youtube") {
            return `<div class="resize-container"><div class="resize-content"><iframe class="youtube-player" type="text/html" data-src="//www.youtube.com/embed/${info.id}${this.config.youtubeParameters?`?${this.config.youtubeParameters}`:''}" frameborder="0" allowfullscreen></iframe></div></div>`;
        }
        if (info.type == "image") {
            return `<img referrerpolicy="no-referrer" data-src="${info.url}">`;
        }
        if (info.type == "twitter") {
            return `<img data-src="//pbs.twimg.com/media/${info.id}:orig">`;
        }
        if (info.type == "imgur-album") {
            let albumMaxSize = this.config.albumMaxSize

            container.textContent = "Loading album...";
            GM_xmlhttpRequest({
                method: "GET",
                url: info.url.replace("://m.", "://"),
                onload(response) {
                    if (response.status < 200 || response.status >= 300) {
                        container.textContent = `${response.status} ${response.statusText}`;
                        return;
                    }
                    container.textContent = "";
                    const text = response.responseText;
                    let match;
                    let hashes;
                    if ((match = text.match(/album_images":\{.+?(\[.+?\])/))) {
                        hashes = JSON.parse(match[1]).map(i => i.hash);
                    } else if ((match = text.match(/\bimage\s*:.+?hash":"([^"]+)/))) {
                        hashes = [match[1]];
                    }
                    if (!hashes) {
                        throw new Error(`Can't find images for ${info.url} (${response.finalUrl})`);
                    }
                    let i = 0;
                    const loadImages = (count = Infinity) => {
                        let html = "";
                        for (; i < hashes.length && count--; i++) {
                            html += `<div class="richcontent"><img referrerpolicy="no-referrer" src="//i.imgur.com/${hashes[i]}.jpg"></div>`;
                        }
                        container.insertAdjacentHTML("beforeend", html);
                    };
                    loadImages(albumMaxSize);
                    if (i < hashes.length) {
                        let button = document.createElement("button");
                        button.textContent = `Load all images (${hashes.length - i} more)`;
                        button.addEventListener('click', () => {
                            button.remove();
                            loadImages();
                        });
                        container.appendChild(button);
                    }
                }
            });
            return;
        }
        throw new Error(`Invalid type: ${info.type}`);
    }
}

class newPttImgurFix extends PttImgurFix {
    constructor(){
        super();

        this.VERSION = '0.0.1';
    }

    //new
    setLinkNoReferrer(){
        let links = document.querySelectorAll("#main-content a");
        for (let link of links) {
            link.setAttribute("referrerpolicy", "no-referrer");
        }
    }

    //new
    createImgAndLink(url){
        let imgElem = document.createElement("img");
        imgElem.setAttribute("referrerpolicy", "no-referrer");
        imgElem.dataset.src = url;

        let linkElem = document.createElement("a");
        linkElem.setAttribute("referrerpolicy", "no-referrer");
        linkElem.href = url;
        linkElem.setAttribute("target", "_blank");

        linkElem.appendChild(imgElem);

        return linkElem.outerHTML.toString();
    }

    //override
    createEmbed(info, container){
        if (info.type == "imgur") {
            return this.createImgAndLink(`//i.imgur.com/${info.id}.jpg`);
        }
        if (info.type == "youtube") {
            return `<div class="resize-container"><div class="resize-content"><iframe class="youtube-player" type="text/html" data-src="//www.youtube.com/embed/${info.id}${this.config.youtubeParameters?`?${this.config.youtubeParameters}`:''}" frameborder="0" allowfullscreen></iframe></div></div>`;
        }
        if (info.type == "image") {
            return this.createImgAndLink(`${info.url}`);
        }
        if (info.type == "twitter") {
            return this.createImgAndLink(`//pbs.twimg.com/media/${info.id}:orig`);
        }
        if (info.type == "imgur-album") {
            let albumMaxSize = this.config.albumMaxSize;

            container.textContent = "Loading album...";
            GM_xmlhttpRequest({
                method: "GET",
                url: info.url.replace("://m.", "://"),
                onload(response) {
                    if (response.status < 200 || response.status >= 300) {
                        container.textContent = `${response.status} ${response.statusText}`;
                        return;
                    }
                    container.textContent = "";
                    const text = response.responseText;
                    let match;
                    let hashes;
                    if ((match = text.match(/album_images":\{.+?(\[.+?\])/))) {
                        hashes = JSON.parse(match[1]).map(i => i.hash);
                    } else if ((match = text.match(/\bimage\s*:.+?hash":"([^"]+)/))) {
                        hashes = [match[1]];
                    }
                    if (!hashes) {
                        throw new Error(`Can't find images for ${info.url} (${response.finalUrl})`);
                    }
                    let i = 0;
                    const loadImages = (count = Infinity) => {
                        let html = "";
                        for (; i < hashes.length && count--; i++) {
                            html += `<div class="richcontent"><img referrerpolicy="no-referrer" src="//i.imgur.com/${hashes[i]}.jpg"></div>`;
                        }
                        container.insertAdjacentHTML("beforeend", html);
                    };
                    loadImages(albumMaxSize);
                    if (i < hashes.length) {
                        let button = document.createElement("button");
                        button.textContent = `Load all images (${hashes.length - i} more)`;
                        button.addEventListener('click', () => {
                            button.remove();
                            loadImages();
                        });
                        container.appendChild(button);
                    }
                }
            });
            return;
        }
        throw new Error(`Invalid type: ${info.type}`);
    }
}


document.addEventListener("beforescriptexecute", (e) => {
	const url = new URL(e.target.src, location.href);
	if (url.hostname.endsWith("imgur.com")) {
		e.preventDefault();
	}
});

document.addEventListener("DOMContentLoaded", () => {
    const pttImgurFix = new newPttImgurFix();

    pttImgurFix.embedLinks();
    pttImgurFix.setLinkNoReferrer();
});