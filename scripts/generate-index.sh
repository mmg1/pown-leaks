#!/usr/bin/env bash

(
    ls lib/db/*.json | while read L
    do
        BASE=`basename $L`
        NAME="${BASE%.*}"
        
        echo "const $NAME = require('./$NAME.json')"
    done

    echo ""
    echo "const { compileCollection } = require('../helpers')"
    echo ""

    echo "module.exports = {"

    ls lib/db/*.json | while read L
    do
        BASE=`basename $L`
        NAME="${BASE%.*}"
        
        echo "    $NAME: compileCollection($NAME),"
    done

    echo "}"
) > lib/db/index.js
