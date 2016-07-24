module.exports = {
  "vendor": [],
  "scripts": {},
  "styles": {
    "prefix": ["> 1%", "last 2 versions", "IE >= 9"],
    "include": []
  },
  "metalsmith": {
    "metadata": {
      "site": {
        "url": "https://github.com/evocode/metalsmith-base"
      }
    },
    "config": {
      "contentRoot": "./content",
      "assetRoot": "./sources",
      "scriptRoot": "./scripts",
      "styleRoot": "./styles",
      "layoutRoot": "./layouts",
      "destRoot": "./build"
    },
    "plugins": {
      "metalsmith-drafts": {},
      "metalsmith-markdown": {
        "smartypants": true,
        "smartLists": true,
        "gfm": true,
        "tables": true
      },
      "metalsmith-excerpts": {},
      "metalsmith-permalinks": {
        "pattern": ":collection/:title"
      },
      "metalsmith-collections": {
        "projects": {
          "sortBy": "date",
          "reverse": true
        }
      },
      "metalsmith-pagination": {
        "collections.projects": {
          "perPage": 6,
          "layout": "projects.html",
          "first": "projects/index.html",
          "noPageOne": true,
          "path": "projects/:num/index.html"
        }
      },
      "metalsmith-layouts": {
        "engine": "handlebars",
        "directory": "./layouts",
        "partials": "./layouts/partials"
      },
      "metalsmith-assets": {
        "source": "./sources",
        "destination": "./"
      },
      "metalsmith-html-minifier": {
        "_metalsmith_if": "production",
        "removeAttributeQuotes": false,
        "keepClosingSlash": true
      }
    }
  }
}
