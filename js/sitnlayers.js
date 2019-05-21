/* global proj4, ol, $ */
(function (window) {
  function sitnLayers() {
    var sitnLayers = {}
    const _extent = [2420000, 1030000, 2900000, 1350000]
    const _crs = 'EPSG:2056'
    const _WMTSurl = 'https://sitn.ne.ch/web_getcapabilities/WMTSGetCapabilities95.xml'
    const _drawSource = new ol.source.Vector()
    const _vectorLayer = new ol.layer.Vector({ source: _drawSource })
    const _sitnBaseLayers = {
      'plan_ville': 'Plan de ville',
      'plan_cadastral': 'Plan cadastral',
      'ortho': 'Images aériennes'
    }
    var _buttons = []
    var _baselayers = []
    var _target
    var _selectTarget
    var _drawSimpleGeom = false

    sitnLayers.sitnCurrentBaseLayer = new ol.layer.Tile()

    // projection
    proj4.defs(_crs,
      '+proj=somerc +lat_0=46.95240555555556 +lon_0=7.439583333333333' +
      ' +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel ' +
      '+towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs')
    ol.proj.proj4.register(proj4)
    const _projection = new ol.proj.Projection({
      code: _crs,
      extent: _extent
    })

    // TODO: get out source from here when base layer selection will be implemented
    sitnLayers.setSource = function (layerName) {
      $.ajax(_WMTSurl).then(function (response) {
        let _parser = new ol.format.WMTSCapabilities()
        let _result = _parser.read(response)
        sitnLayers.WMTSOptions = ol.source.WMTS.optionsFromCapabilities(
          _result, {
            layer: layerName,
            matrixSet: _crs
          })
        let source = new ol.source.WMTS(sitnLayers.WMTSOptions)
        sitnLayers.sitnCurrentBaseLayer.setSource(source)
      })
    }

    sitnLayers.view = new ol.View({
      projection: _projection,
      center: ol.proj.fromLonLat([6.80, 47.05], _projection),
      zoom: 4
    })

    /**
     * Toogles multiple geometry mode, if it's set to simple geometry
     * and multiple geometries were already drawn -> only keeps the last drawn geometry
     */
    sitnLayers.setSimpleGeom = function (value) {
      _drawSimpleGeom = value
      if (_drawSimpleGeom && _drawSource.getFeatures().length > 1) {
        lastFeature = _drawSource.getFeatures().slice(-1)[0]
        _drawSource.clear()
        _drawSource.addFeature(lastFeature)
      }
    }

    sitnLayers.createMap = function (options) {
      _buttons = options['buttons']
      _baselayers = options['baseLayers']
      _target = options['target']
      _selectTarget = options['selectTarget']
      _drawSimpleGeom = options['drawSimpleGeom'] // controls wether or not an user can draw multiple geometries
      let _mainbar
      let _map = new ol.Map({
        target: _target,
        layers: [
          sitnLayers.sitnCurrentBaseLayer,
          _vectorLayer
        ],
        view: sitnLayers.view
      })

      /**
       * Creates select options, sets first baseLayer as default
       * or sets plan_ville if no _baselayers are defined
       */
      if (_baselayers) {
        $.each(_baselayers, function (key, value) {
          $('#' + _selectTarget)
            .append(new Option(_sitnBaseLayers[value], value))
        })
        $('#' + _selectTarget).change(function () {
          let newSource = $('#' + _selectTarget + ' option:selected').val()
          sitnLayers.setSource(newSource)
        })
        this.setSource(_baselayers[0])
      } else {
        this.setSource('plan_ville')
      }

      if (_buttons) {
        _mainbar = new ol.control.Bar()
        _map.addControl(_mainbar)
        _mainbar.setPosition('top-left')
        var editbar = new ol.control.Bar({
          toggleOne: true, // one control active at the same time
          group: false // group controls together
        })
        _mainbar.addControl(editbar)

        // Edit control bar
        if (_buttons.indexOf('edit') !== -1) {
          // Add selection tool:
          //  1- a toggle control with a select interaction
          //  2- an option bar to delete / get information on the selected feature
          var sbar = new ol.control.Bar()
          sbar.addControl(new ol.control.TextButton({
            html: '<i class="fas fa-trash"></i>',
            title: 'Effacer',
            handleClick: function () {
              var features = selectCtrl.getInteraction().getFeatures()
              if (!features.getLength()) console.log('Select an object first...')
              else console.log(features.getLength() + ' object(s) deleted.')
              for (var i = 0, f; (f = features.item(i)); i++) {
                _vectorLayer.getSource().removeFeature(f)
              }
              selectCtrl.getInteraction().getFeatures().clear()
            }
          }))

          var selectCtrl = new ol.control.Toggle({
            html: '<small class="fas fa-mouse-pointer"></small>',
            title: 'Select',
            interaction: new ol.interaction.Select(),
            bar: sbar,
            autoActivate: true,
            active: true
          })
          editbar.addControl(selectCtrl)
        }

        // Add editing tools
        if (_buttons.indexOf('createPoint') !== -1) {
          var pedit = new ol.control.Toggle({
            html: '<small class="fas fa-map-pin"></small>',
            title: 'Point',
            interaction: new ol.interaction.Draw({
              type: 'Point',
              source: _vectorLayer.getSource()
            })
          })
          editbar.addControl(pedit)
        }
        if (_buttons.indexOf('createLineString') !== -1) {
          var ledit = new ol.control.Toggle(
            {
              html: '<small class="fas fa-check fa-rotate-270 fa-flip-vertical"></small>',
              title: 'LineString',
              interaction: new ol.interaction.Draw({
                type: 'LineString',
                source: _vectorLayer.getSource(),
                // Count inserted points
                geometryFunction: function (coordinates, geometry) {
                  if (geometry) {
                    geometry.setCoordinates(coordinates)
                  } else geometry = new ol.geom.LineString(coordinates)
                  this.nbpts = geometry.getCoordinates().length
                  return geometry
                }
              }),
              // Options bar associated with the control
              bar: new ol.control.Bar(
                {
                  controls: [new ol.control.TextButton({
                    html: '<i class="fas fa-undo"></i>',
                    title: 'Revenir en arrière',
                    handleClick: function () {
                      if (ledit.getInteraction().nbpts > 1) ledit.getInteraction().removeLastPoint()
                    }
                  }),
                  new ol.control.TextButton({
                    html: '<i class="fas fa-check"></i>',
                    title: 'Terminer la construction',
                    handleClick: function () { // Prevent null objects on finishDrawing
                      if (ledit.getInteraction().nbpts > 2) ledit.getInteraction().finishDrawing()
                    }
                  })
                  ]
                })
            })
          editbar.addControl(ledit)
        }

        if (_buttons.indexOf('createPolygon') !== -1) {
          var fedit = new ol.control.Toggle(
            {
              html: '<small class="fas fa-play fa-rotate-270"></small>',
              title: 'Polygon',
              interaction: new ol.interaction.Draw({
                type: 'Polygon',
                source: _vectorLayer.getSource(),
                // Count inserted points
                geometryFunction: function (coordinates, geometry) {
                  this.nbpts = coordinates[0].length
                  if (geometry) geometry.setCoordinates([coordinates[0].concat([coordinates[0][0]])])
                  else geometry = new ol.geom.Polygon(coordinates)
                  return geometry
                }
              }),
              // Options bar associated with the control
              bar: new ol.control.Bar(
                {
                  controls: [new ol.control.TextButton({
                    html: '<i class="fas fa-undo"></i>',
                    title: 'Revenir en arrière',
                    handleClick: function () {
                      if (fedit.getInteraction().nbpts > 1) fedit.getInteraction().removeLastPoint()
                    }
                  }),
                  new ol.control.TextButton({
                    html: '<i class="fas fa-check"></i>',
                    title: 'Terminer la construction',
                    handleClick: function () { // Prevent null objects on finishDrawing
                      if (fedit.getInteraction().nbpts > 3) fedit.getInteraction().finishDrawing()
                    }
                  })
                  ]
                })
            })
          editbar.addControl(fedit)
        }

        // If this option is enabled, then the user can only draw simple geometries
        _drawSource.on('addfeature', function (event) {
          if (_drawSimpleGeom && _drawSource.getFeatures().length > 1) {
            _drawSource.clear()
            _drawSource.addFeature(event.feature)
          }
        });
      }
    }
    sitnLayers.loadWKT = function (wkt) {
      let format = new ol.format.WKT()
      let data = wkt;
      let features = format.readFeatures(data, {
        dataProjection: _crs,
        featureProjection: _crs
      })
      _vectorLayer.getSource().addFeatures(features)
    }

    sitnLayers.getWKTData = function () {
      let features = _vectorLayer.getSource().getFeatures()
      if (features) {
        let wktData = new ol.format.WKT().writeFeatures(features)
        return wktData
      }
    }
    return sitnLayers
  }

  window.SitnMap = sitnLayers
})(window)
