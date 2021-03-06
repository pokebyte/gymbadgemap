const SETTINGS_TITLE = 'gymBadgeMap';
const BADGE_COLORS = {
    gold: 'gold',
    silver: 'lightsteelblue',
    bronze: 'sandybrown',
    visited: 'palegreen',
    none: 'darkseagreen'
};
const EXTRA_COLORS = {
    legacy: 'gray',
    active: 'black'
};

const ASCII_ZERO = 48;
const ASCII_SEARCH = 102;  // f

const BREMEN = [53.07, 8.79];  // latitude, longitude
const VIEW = BREMEN;
const ZOOM = 12;

var gyms = {};
var legacyGyms = {};
var popupGymId = null;

var baseLayers = {};
var overlays = {};
Object.keys(BADGE_COLORS).forEach(function(badge) {
    overlays[badge] = L.layerGroup();
});

var map = L.map('map', {
    zoomControl: false,
    layers: Object.values(overlays)
}).setView(VIEW, ZOOM);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

L.control.zoom({position: 'bottomleft'}).addTo(map);

var userLocation;
map.on('locationfound', function(e) {
    function removeUserLocation() {
        map.removeLayer(userLocation);
    }
    if (userLocation) {
        removeUserLocation();
    }
    userLocation = L.marker(e.latlng).addTo(map);
    userLocation.on('click', removeUserLocation);
});
map.on('locationerror', function(e) {
    console.log(e);
    alert(e.message);
});
var locateControl = L.control({position: 'bottomleft'});
locateControl.onAdd = function(map) {
    var div = L.DomUtil.create('div', 'leaflet-bar');
    var a = L.DomUtil.create('a', 'leaflet-control-zoom-in leaflet-interactive', div);
    a.innerHTML = '&#x1f4cd;';  // pin symbol
    a.addEventListener('click', function() {
        map.locate({setView: true, maxZoom: map.getZoom()});
    });
    return div;
};
locateControl.addTo(map);

L.control.layers(baseLayers, overlays, {position: 'topleft'}).addTo(map);
var layersControl = document.getElementsByClassName('leaflet-control-layers-overlays')[0];
for (var i = 0; i < layersControl.children.length; i++) {
    var option = layersControl.children[i];
    option.style = 'display: inline-block;';
    var optionLabel = option.children[0].children[1];
    var badgeColor = optionLabel.innerHTML.trim();
    option.children[0].removeChild(optionLabel);
    var badge = L.DomUtil.create('span');
    L.DomUtil.addClass(badge, 'badge');
    badge.style = 'background-color: ' + BADGE_COLORS[badgeColor] + ';';
    badge.innerHTML += '<span id="' + badgeColor + 'BadgeCount" class="badgeCount"></span>';
    option.appendChild(badge);
    option.onclick = function() {
        var badge = this.children[1];
        if (this.children[0].children[0].checked) {
            L.DomUtil.removeClass(badge, 'badgeHidden');
        } else {
            L.DomUtil.addClass(badge, 'badgeHidden');
        }
    }
}
var menu = document.createElement('div');
var template = document.getElementById('menuTemplate');
menu.innerHTML = template.innerHTML;
document.body.removeChild(template);
layersControl.appendChild(menu);

var searchControl = L.control({position: 'topright'});
searchControl.onAdd = function(map) {
    var template = document.getElementById('searchTemplate');
    document.body.removeChild(template);
    var div = L.DomUtil.create('div', 'searchControl');
    div.innerHTML = template.innerHTML;
    return div;
};
searchControl.addTo(map);

function ajax(url, onResponse) {
    var xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState === 4 && this.status === 200) {
            onResponse(this.responseText);
        }
    };
    xhttp.open('GET', url, true);
    xhttp.send();
}

var translation;
ajax('de.json', function (text) {
    translation = JSON.parse(text);
    document.getElementById('title').innerHTML = translation['title'];
    document.getElementById('legacyGymsLabel').innerHTML = translation['legacyGyms'];
    document.getElementById('importGyms').value = translation['importGyms'];
    document.getElementById('exportGyms').value = translation['exportGyms'];
    document.getElementById('gymSearch').placeholder = translation['gymSearch'];
});

function Gym(coordinates, id, name, badge, legacy) {
    this._coordinates = coordinates;
    this._id = '' + id;
    this._name = name || '[no name]';
    this._badge = badge || 'none';
    this._legacy = legacy || false;
    var extraColor = legacy ? EXTRA_COLORS.legacy : EXTRA_COLORS.active;
    var marker = L.circleMarker(coordinates, {
        color: extraColor,
        fillColor: BADGE_COLORS[badge],
        fillOpacity: 1,
        radius: 10
    });
    var popup = '<div class="gymName">' + name + '</div>';
    Object.keys(BADGE_COLORS).forEach(function(badge) {
        popup += '<input type="button" class="badge" style="background-color: ' + BADGE_COLORS[badge]
            + ';" title="' + badge + '" onclick="setGymBadge(\'' + id + '\', \'' + badge + '\')">';
    });
    marker.bindPopup(popup);
    marker.bindTooltip(
        '<b style="color: ' + extraColor + ';">' + name + '</b>',
        {className: badge, opacity: 1}
    );
    marker.on('click', function() {
        marker.closeTooltip();
    });
    marker.on('popupopen', function() {
        popupGymId = id;
    });
    this._marker = marker;
    overlays[badge].addLayer(marker);
}

function setGymBadge(id, badge, noSave) {
    var gym = gyms[id];
    var extraColor = gym._legacy ? EXTRA_COLORS.legacy : EXTRA_COLORS.active;
    var marker = gym._marker;
    overlays[gym._badge].removeLayer(marker);
    overlays[badge].addLayer(marker);
    marker.setStyle({fillColor: BADGE_COLORS[badge]});
    marker.unbindTooltip();
    marker.bindTooltip(
        '<b style="color: ' + extraColor + ';">' + gym._name + '</b>',
        {className: badge, opacity: 1}
    );
    gym._badge = badge;
    map.closePopup();
    if (!noSave) {
        saveGymsToLocalStorage();
    }
    updateBadgeCounts();
    popupGymId = null;
}

function updateAutoCompleteList() {
    var gymListHTML = '';
    Object.values(gyms).forEach(function(gym) {
        gymListHTML += '<option value="' + gym._name.replace(/"/g, '&quot;') + '"/>';
    });
    document.getElementById('gymList').innerHTML = gymListHTML;
}

function updateBadgeCounts() {
    var badgeCounts = {};
    Object.values(gyms).forEach(function(gym) {
        var badge = gym._badge;
        if (badgeCounts[badge]) {
            badgeCounts[badge]++;
        } else {
            badgeCounts[badge] = 1;
        }
    });
    Object.keys(BADGE_COLORS).forEach(function(badge) {
        document.getElementById(badge + 'BadgeCount').innerHTML = badgeCounts[badge] || 0;
    });
}

function openGymPopup() {
    Object.values(gyms).forEach(function(gym) {
        var gymSearch = document.getElementById('gymSearch');
        if (gym._name === gymSearch.value) {
            gymSearch.blur();
            gym._marker.openPopup();
            map.setView(gym._coordinates, map.getZoom());
        }
    });
}

function toggleLegacyGyms() {
    document.getElementsByClassName('legacy')[0].classList.toggle('badgeHidden');
    var show = document.getElementById('legacyGyms').checked;
    Object.values(legacyGyms).forEach(function(gym) {
        if (show) {
            overlays[gym._badge].addLayer(gym._marker);
        } else {
            overlays[gym._badge].removeLayer(gym._marker);
        }
    });
}

function createJson() {
    var gymsArray = [];
    Object.values(gyms).forEach(function(gym) {
        if (gym._badge !== 'none') {
            gymsArray.push(JSON.parse(JSON.stringify(gym, [
                '_coordinates',
                '_id',
                '_name',
                '_badge'
            ])));
        }
    });
    return JSON.stringify({gyms: gymsArray});
}

function createGyms(json) {
    var jsonGyms = JSON.parse(json).gyms;
    jsonGyms.forEach(function(gym) {
        var coordinates = gym._coordinates || [gym.latitude, gym.longitude];
        var id = gym._id || gym.gym_id;
        var name = gym._name || gym.name;
        var badge = gym._badge || 'none';
        var legacy = gym._legacy || false;
        gym = gyms[id];
        if (gym) {
            gym._coordinates = coordinates;
            gym._name = name;
            if (badge !== 'none') {
                setGymBadge(id, badge, true);
            }
            if (legacy) {
                gym._legacy = true;
                var marker = gym._marker;
                var tooltip = marker.getTooltip();
                marker.setStyle({color: EXTRA_COLORS.legacy});
                tooltip._content = tooltip._content.replace(
                    'style="color: ' + EXTRA_COLORS.active + ';',
                    'style="color: ' + EXTRA_COLORS.legacy + ';'
                );
            }
        } else {
            gyms[id] = new Gym(coordinates, id, name, badge, legacy);
        }
        if (legacy) {
            legacyGyms[id] = gyms[id];
        }
    });
    saveGymsToLocalStorage();
    updateAutoCompleteList();
    updateBadgeCounts();
}

function loadGymsFromLocalStorage() {
    try {
        createGyms(localStorage.getItem(SETTINGS_TITLE));
    } catch (error) {
        console.log('localStorage is not available');
    }
}

function saveGymsToLocalStorage() {
    if (!Object.keys(gyms).length) {
        return;
    }
    try {
        localStorage.setItem(SETTINGS_TITLE, createJson());
    } catch (error) {
        console.log('localStorage is not available');
    }
}

function loadGymsFromFile() {
    const INPUT_ID = 'files';
    var files = document.getElementById(INPUT_ID);
    if (files) {
        document.body.removeChild(files);
    }
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = INPUT_ID;
    fileInput.style.display = 'none';
    fileInput.onchange = readGymsFromFile;
    document.body.appendChild(fileInput);
    fileInput.click();
}

function readGymsFromFile() {
    var files = document.getElementById('files').files;
    if (!files.length) {
        return;
    }
    var reader = new FileReader();
    reader.onloadend = function(event) {
        if (reader.readyState === FileReader.DONE) {
            createGyms(reader.result);
        }
    };
    reader.readAsText(files[0]);
}

function saveGymsToFile() {
    const LINK_ID = 'link';
    var link = document.getElementById(LINK_ID);
    if (link) {
        document.body.removeChild(link);
    }
    link = document.createElement('a');
    var file = new Blob([createJson()], {type: 'application/json'});
    link.href = window.URL.createObjectURL(file);
    link.style.display = 'none';
    link.download = 'gyms.json';
    link.id = LINK_ID;
    document.body.appendChild(link);
    link.click();
}

window.onkeypress = function(event) {
    var key = event.keyCode || event.which;
    var badges = Object.keys(BADGE_COLORS);
    var gymSearch = document.getElementById('gymSearch');
    var update = false;
    if (popupGymId && key > ASCII_ZERO && key <= ASCII_ZERO + badges.length) {
        setGymBadge(popupGymId, badges[key - 1 - ASCII_ZERO]);
        update = true;
    }
    if (update || key === ASCII_SEARCH && gymSearch !== document.activeElement) {
        setTimeout(function() {
            gymSearch.focus();
        }, 0);
    }
};

loadGymsFromLocalStorage();
ajax('gyms-gomap.json', createGyms);
ajax('gyms-gymhuntr.json', createGyms);
ajax('gyms-pokemongomap.json', createGyms);
ajax('gyms-intel.json', createGyms);
