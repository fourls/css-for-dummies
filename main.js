const fs = require('fs');
const prompt = require('prompt');
const ntc = require('./ntc');
const cssProperties = require('./properties.json');
const htmlTemplate = fs.readFileSync('outputtemplate.html').toString();

function rgb2hex(rgb){
 rgb = rgb.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i);
 return (rgb && rgb.length === 4) ? "#" +
  ("0" + parseInt(rgb[1],10).toString(16)).slice(-2) +
  ("0" + parseInt(rgb[2],10).toString(16)).slice(-2) +
  ("0" + parseInt(rgb[3],10).toString(16)).slice(-2) : '';
}

// A class that just serves to be an easy interface to the JSON properties
class CSSProperty {
    constructor (ref,prop) {
        var tmpl, vals;
        if(ref != undefined) {
            // assign this class's variables based on what it says in the properties
            tmpl = ref['template'];
            vals = ref['vals'];
        }

        // Takes the form of
        // "the {property} is {value}"
        this.template = tmpl !== undefined ? tmpl : 'the {property} is {value}';
        this.vals = vals !== undefined ? vals : {};

        // The pure CSS values (key: value;)
        this.key = prop[0];
        this.value = prop[1];

        this.overrideValue = this.vals[this.value];

        if(this.overrideValue === undefined) {
            this.readable = this.template.replace('{value}',this.value);
        } else {
            this.readable = this.overrideValue;
        }
    }

    getFullString() {
        /*
        var separator = ' ';
        if(this.concatenation == '') {
            separator = '';
        }

        return this.beginning + ' ' + this.readable + ' ' + this.concatenation + separator + this.value;*/

        return this.readable;
    }
}

// Remove vendor prefixes like -moz-, -o-, -webkit-, -ms-
function removeVendorPrefixes(property) {
    // Regex: [0]=full, [1]=prefix, [2]=property
    regex = /^-(\w*?)-([\w-]*)(?=:)/;
    //return [property.replace(regex,'$1'),property.replace(regex,'$2')];
    return property.replace(regex,'$2');
}

// get a human readable version of a CSS selector
function parseCSSSelector(selector) {
    var queryRegex = /^@(.*)/g;
    // if it is a query (@) then discard it
    if(queryRegex.test(selector)) {
        return false;
    }

    // split the selector into every component
    var sectionsStrings = selector.split(' ');
    var sections = [];

    // for every component construct a human readable string describing it
    sectionsStrings.forEach(function(section) {
        // Regex: [0]=full, [1]=name(including [.#]), [2]=htmlattrkey, [3]=htmlattrval
        var sectionRegex = /([#.:]?[A-Za-z-0-9]+)(?:\[(.+?)=(.+?)\])?/g;

        var secArray = [];
        // read all areas of the component
        var secParts = sectionRegex.exec(section);
        while (secParts != null) {
            var typeRegex = /([.#:])/g;
            // get the type of selector
            var typeRes = secParts[1].match(typeRegex);
            var type;
            // if it can't find a special symbol, it must be an element name
            if(typeRes == null) {
                typeRes = ['element'];
            }
            switch(typeRes[0]) {
                case '#':
                    type = 'with the ID';
                    break;
                case '.':
                    type = 'classed';
                    break;
                case ':':
                    type = 'when it is';
                    break;
                case 'element':
                    type = 'named';
                    break;
            }
            
            // creates a string like "selector"
            var content = '&quot;' + secParts[1].replace(typeRegex,'') + '&quot;';

            // pushes data into array of every area of this component
            secArray.push({'type':type,'content':content});

            var keyName = secParts[2];
            var valName = secParts[3];

            // if the key and value were actually found
            if(keyName != undefined && valName != undefined) {
                secArray.push({'type':'with the HTML attribute','content':'&quot;' + keyName + '&quot; that equals &quot;' + valName + '&quot;'})
            }

            secParts = sectionRegex.exec(section);
        }

        // This is the return string for one component
        var retString = '';

        secArray.forEach(function(part) {
            if(retString != '') {
                retString += ' + ';
            } else {
                // this is the start of the string
                retString = ' an element ';
            }
            retString += part['type'] + ' ' + part['content'];
        });

        // push the string into array of every component
        sections.push(retString);
    });

    // This is the return string for the selector and entire function
    var retVal = '';

    // This allows the word 'inside' to be used
    sections.reverse();

    sections.forEach(function(section) {
        if(retVal != '') {
            retVal += ' inside ';
        } else {
            retVal = ' in ';
        }
        retVal += section;
    });

    return retVal;
}

// Parses the CSS from a string to an array containing [selector]=human readable selector, and [properties]=array of properties
function parseCSSToArray(css) {
    // Regex: [0]=full, [1]=selector, [2]=content
    // This regex doesn't get used for its groups though
    var sentenceStrings = css.match(/(.*?)\s*{((?:.*?\n?)*?)}/gm);
    // This array will contain separated valid CSS
    var elementStrings = [];

    for (var i = 0; i < sentenceStrings.length; i++) {
        // Regex: [0]=full, [1]=selector
        var selectorRegex = /\s*(.*?)\s*{/gm;
        var selector = selectorRegex.exec(sentenceStrings[i])[1];
        // Splits the selector by the comma delimiter
        var sentences = selector.split(',');

        // Regex: [0]=full, [1]=string of properties
        var propStrRegex = /{([^]*)}/gm;
        var propertiesString = propStrRegex.exec(sentenceStrings[i])[1];
        
        // For every separated 'sentence', add that sentence as a selector with all its properties
        sentences.forEach(function(sent) {
            elementStrings.push(sent + ' {' + propertiesString + '}');
        });
    }

    // This array will contain a list of [selector, propertiesArray]
    var elements = [];
    for(var i = 0; i < elementStrings.length; i++) {
        var element = elementStrings[i];
        // Regex: [0]=full, [1]=selector
        var selectorRegex = /\s*(.*?)\s*{/gm;
        var selector = selectorRegex.exec(element)[1];
        // makes the selector human readable
        selector = parseCSSSelector(selector);
        // if parseCSSSelector() returned false - discard this element
        if(selector == false) {
            continue;
        }

        // Regex: [0]=full, [1]=properties as a string
        var propStrRegex = /{([^]*)}/gm;
        var propertiesString = propStrRegex.exec(element)[1];

        // Regex: [0]=full, [1]=key, [2]=value
        var propArrRegex = /([^\s]*?)\s*:\s*(.*?)[;\n]/g;
        var propertiesArray = [];
        var property = propArrRegex.exec(propertiesString);
        while (property != null) {
            // Sets propValues to [0]=key, [1]=value
            var propValues = [property[1],property[2]]
            // If the property can't be found, remove vendor prefixes and try again
            var propRef = cssProperties[propValues[0]] !== undefined ? cssProperties[propValues[0]] : cssProperties[removeVendorPrefixes(propValues[0])];

            // Creates a new CSSProperty
            var thisProp = new CSSProperty(propRef,propValues);
            propertiesArray.push(thisProp);

            property = propArrRegex.exec(propertiesString);
        }

        // pushes an array of [human readable selector, array of properties] to elements
        elements.push({
            selector: selector,
            properties: propertiesArray
        });
    }

    // returns array of arrays of [human readable selector, array of properties]
    return elements;
}

// Beginning of file
if(require.main == module) {
    prompt.get([
        {
            name: 'input',
            message: 'Which CSS file would you like to dumb down?',
            // Regex: [0]=full, [1]=filepath, [2]=filename
            // This regex isn't used for its groups though
            validator: /((?:.*?\/)*)(.*?\.css)/ig,
            warning: 'Please input a valid path to a CSS file (.css).',
            default: 'test.css'
        },
        {
            name: 'output',
            message: 'Where do you want the result?',
            warning: 'Please input a valid directory.',
            default: 'test.html'
        }
    ], function(err, result) {
        // Read the result of the prompt to a string
        var inputFile = fs.readFileSync(result['input']).toString();
        // Parse the CSS - this var is an array of arrays containing human readable selectors and properties
        var css = parseCSSToArray(inputFile);
        var output = '';

        css.forEach(function(element) {
            /*console.log(element['selector'] + ':');
            element['properties'].forEach(function (property) {
                // Logs the property
                console.log('   ' + property.getFullString());
            });*/

            output += `<h1>${element['selector']}</h1><ul>`;
            element['properties'].forEach(function (property) {
                output += `<li>${property.getFullString()}</li>`;
            });
            if(element['properties'].length == 0) {
                output += `<li>there aren't any special properties</li>`;
            }
            output += `</ul>`;
        });

        output = output
            // envelop quotes with a span
            .replace(/&quot;(.*?)&quot;/g,'<span class="quotes">$1</span>')
            // envelop occurences of the word 'inside' with a span
            .replace(/(?!&quot;)inside(?!&quot;)/g,'<span class="inside">$&</span>')
            // envelop hexadecimal colors with a span
            .replace(/#[A-Fa-f0-9]{6}/g, function(value) {
                // Get human readable name of color
                var color = ntc.name(value);
                // [0]=rgb code, [1]=human readable name, [2]=exact match(bool)
                var displayColor = color[1];
                // An invalid color responds with 'Invalid Color: <input>'
                if(/Invalid Color/.test(color[1])) {
                    displayColor = value;
                }

                return `<span class="color" style="color: ${value}">${displayColor}</span>`;
            })
            // envelop rgba colors with a span
            .replace(/rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?([\d\.]+)[\s+]?\)/ig, function(value,r,g,b,alpha) {
                var hex = rgb2hex(value);

                // Get human readable name of color
                var color = ntc.name(hex);
                // [0]=rgb code, [1]=human readable name, [2]=exact match(bool)
                var displayColor = color[1];
                // An invalid color responds with 'Invalid Color: <input>'
                if(/Invalid Color/.test(color[1])) {
                    displayColor = value;
                }

                var displayAlpha = '';

                if(parseFloat(alpha) != 1) {
                    displayAlpha = ' with a transparency of ' + (parseFloat(alpha) * 100).toString() + '%';
                }

                return `<span class="color" style="color: ${value}">${displayColor}${displayAlpha}</span>`;
            })
            // envelop URLs with an a
            .replace(/url\("?([^)\n]*?)"?\)/g, '<a href="">$1</a>')
            .replace(/rotate\("?([^)\n]*?)"?\)/g, '$1 rotation')
            .replace(/(\d)px/g,'$1 pixels')
        ;

        var outputFile = fs.writeFileSync(result['output'],htmlTemplate.replace(/@\.@/g,output));
    });
}