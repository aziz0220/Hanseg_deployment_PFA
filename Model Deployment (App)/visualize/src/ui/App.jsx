import {
  useState,
  useEffect,
  useCallback,
  useContext,
  createContext,
} from "react";
import "./App.css";
import { nvUtils } from "./nvUtils";
import { Niivue, NVDocument, SLICE_TYPE, NVImage } from "@niivue/niivue";
import { NiivueCanvas } from "./components/NiivueCanvas";
import { Sidebar } from "./components/Sidebar";
import { FileList } from "./components/FileList";
import { ImageTools } from "./components/ImageTools";
import { FileItem } from "./components/FileItem";
import { ColormapSelect } from "./components/ColormapSelect";
import { MinMaxInput } from "./components/MinMaxInput";
import { MosaicInput } from "./components/MosaicInput";
import { OpacitySlider } from "./components/OpacitySlider";
import CssBaseline from "@mui/material/CssBaseline";
import Container from "@mui/material/Container";
import axios from "axios";

// use a context to call the Niivue instance from any component
const _nv = new Niivue();
const NV = createContext(_nv);


fetch('./color_map.json')
  .then(response => response.json())
  .then(customColormap => {
    // Add your custom colormap to the ColorTables instance
    _nv.addColormap('HaN_Seg', customColormap);
  })
  .catch(error => console.error('Error:', error));

// map the slice type UI string to the Niivue slice type
const sliceTypes = {
  axial: SLICE_TYPE.AXIAL,
  coronal: SLICE_TYPE.CORONAL,
  sagittal: SLICE_TYPE.SAGITTAL,
  multiPlanarACS: SLICE_TYPE.MULTIPLANAR,
  render: SLICE_TYPE.RENDER,
};

function App() {
  // create a new Niivue object
  const nv = useContext(NV);

  nv.onImageLoaded = (volume) => {
    handleDrop();
  };

  nv.onLocationChange = (locationData) => {
    // set the window title to locationData.string
    document.title = locationData.string;
  };


  // get the list of colormap names
  const colormapNames = nv.colormaps(true); // sorted by name

  // create an array of objects with the colormap name and values (used to render the colormap select)
  const colormaps = colormapNames.map((name) => {
    return {
      name: name,
      values: nv.colormapFromKey(name),
    };
  });

  // ------------ State ------------
  // set the initial state of the commsInfo object to an empty object
  const [commsInfo, setCommsInfo] = useState({});
  const [activeImage, setActiveImage] = useState(0); // index of the active image
  const [images, setImages] = useState([]);
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(0);
  const [calMin, setCalMin] = useState(0);
  const [calMax, setCalMax] = useState(0);
  const [opacity, setOpacity] = useState(1);
  const [colormap, setColormap] = useState("gray"); // default
  const [sliceType, setSliceType] = useState("");
  const [mosaicString, setMosaicString] = useState("A 0 20 C 30 S 42");

  // ------------ Callbacks ------------
  // add a volume from a URL



  const addVolume = useCallback(
    async (path, commsInfo) => {
      //let url = makeNiivueUrl(path, commsInfo);
      let url = `http://localhost:8050/${path}`;
      console.log(url);
      // await nv.addVolumeFromUrl({ url: url, name: path });
      let image= await NVImage.loadFromUrl({url:url})
      await nv.addVolume(image);
      let volumes = nv.volumes;
      let newImages = volumes.map((volume, index) => {
        return {
          url: volume.url,
          name: volume.name,
          index: index,
          id: volume.id,
          color: volume.colormap,
          active: index === activeImage,
          frame: volume.frame4D,
          maxFrame: volume.nTotalFrame4D,
        };
      });
      setImages(newImages);
    },
    [activeImage, nv, setImages]
  );

  const setVisibility = useCallback(
    (index, opacity) => {
      nv.setOpacity(index, opacity);
    },
    [nv]
  );

  const updateOpacity = useCallback(
    (opacity) => {
      nv.setOpacity(activeImage, opacity);
      setOpacity(opacity);
    },
    [activeImage, nv]
  );

  // const updateColormap = useCallback(
  //   (colormap) => {
  //     nv.volumes[activeImage].colormap = colormap;
  //     nv.updateGLVolume();
  //   },
  //   [activeImage, nv]
  // );

    async function fetchJSON(fnm) {
const response = await fetch(fnm)
const js = await response.json()
return js
}

    const updateColormapLabel = useCallback(
    async (colormap) => {
      let cmap1 = await fetchJSON("./color_map.json")
      nv.volumes[activeImage].setColormapLabel(cmap1) ;

      nv.updateGLVolume();
    },
    [activeImage, nv]
  );

  const setCalMinMax = useCallback(
    (min, max) => {
      nv.volumes[activeImage].cal_min = min;
      nv.volumes[activeImage].cal_max = max;
      nv.updateGLVolume();
      setMin(min);
      setMax(max);
    },
    [activeImage, nv]
  );

  const onMosaicChange = (newValue) => {
    nv.setSliceMosaicString(newValue);
    setMosaicString(newValue);
  };

  // ------------ Effects ------------
  // get the comms info from the main process
  // when the app is first loaded
  useEffect(() => {
    async function getCommsInfo() {
      let info = await nvUtils.getCommsInfo();
      console.log(info);
      setCommsInfo(info);

      nvUtils.onSaveMosaicString(() => {
        saveMosaicString(nv.sliceMosaicString);
      });

      nvUtils.onLoadMosaicString(() => {
        loadMosaicString();
      });

      nvUtils.onLoadDocument(() => {
        loadDocument();
      })

      nvUtils.onSaveDocument(() => {
        saveDocument();
      })

      // set the callback for when volumes are loaded
      nvUtils.onLoadVolumes((imgs) => {
        console.log("loaded volumes", imgs);
        imgs.forEach(async (img) => {
          await addVolume(img, info);
        });
      });

      nvUtils.onCloseAllVolumes(() => {
        let volumes = nv.volumes;
        // loop over all volumes from the end of the array to the beginning
        // this is because when a volume is removed, the array is reindexed
        // so if you remove the first volume, the second volume becomes the first
        // and the second volume is never removed
        for (let i = volumes.length - 1; i >= 0; i--) {
          nv.removeVolumeByIndex(i);
        }
        setImages([]);
        // update active image, min, max, opacity
        setActiveImage(0);
        setMin(0);
        setMax(0);
        setOpacity(1);
        setCalMax(0);
        setCalMin(0);
      });
      // set the callback for when the view needs updating
      nvUtils.onSetView((view) => {
        setSliceType(view);
        // clear the mosaic string
        nv.setSliceMosaicString("");
        if (view === "multiPlanarACSR") {
          nv.opts.multiplanarForceRender = true;
        } else if (view === "mosaic") {
          nv.setSliceMosaicString("A 0 20 C 30 S 42");
          nv.opts.multiplanarForceRender = false;
        } else {
          nv.opts.multiplanarForceRender = false;
        }
        nv.setSliceType(sliceTypes[view]);
      });
      nvUtils.onSetOpt((view) => {
        // view is an array with the first element as the option name and the second as the value(s)
        console.log("Setting ", view[0], " as ", view[1]);
        nv.opts[view[0]] = view[1];
        nv.updateGLVolume();
        nv.drawScene();
      });
      nvUtils.onSetDrawPen((pen) => {
        // pen is color for drawing
        if (pen === Infinity) {
          nv.setDrawingEnabled(false);
          return;
        } else {
          nv.setDrawingEnabled(true);
        }
        let isFilled = nv.opts.isFilledPen;
        console.log("Setting draw pen to ", pen);
        nv.setPenValue(pen, isFilled);
      });
      nvUtils.onSetEvalStr((str) => {
        console.log("Evaluating ", str);
        eval(str);
      });
      nvUtils.onGetOpt((opt) => {
        // opt is the option name, returns current value(s)
        let val = nv.opts[opt[0]];
        console.log("Getting ", opt[0], " which is", val);
        return val;
      });
      // set the callback for when the DRAG mode changes
      nvUtils.onSetDragMode((mode) => {
        switch (mode) {
          case "pan":
            nv.opts.dragMode = nv.dragModes.pan;
            break;
          case "contrast":
            nv.opts.dragMode = nv.dragModes.contrast;
            break;
          case "measure":
            nv.opts.dragMode = nv.dragModes.measurement;
            break;
          case "none":
            nv.opts.dragMode = nv.dragModes.none;
            break;
        }
      });

      // set the callback for when the volume number updates (4D files)
      nvUtils.onSetFrame((frame) => {
        let vol = nv.volumes[activeImage];
        let id = vol.id;
        let currentFrame = vol.frame4D;
        nv.setFrame4D(id, currentFrame + frame);
        // TODO: update the frame in the FileItem
      });
    }
    getCommsInfo();
  }, [activeImage, nv, addVolume]);

  // when active image changes, update the min and max
  useEffect(() => {
    if (images.length === 0) {
      return;
    }
    let vol = nv.volumes[activeImage];
    setCalMin(vol.cal_min);
    setCalMax(vol.cal_max);
    setMin(vol.cal_min);
    setMax(vol.cal_max);
    setOpacity(vol.opacity);
    setColormap(vol.colormap);
  }, [activeImage, images, nv]);

  // when user changes intensity with the right click selection box
  // for now, only works with the background image
  useEffect(() => {
    nv.onIntensityChange = (volume) => {
      setMin(volume.cal_min);
      setMax(volume.cal_max);
    };
  }, [nv]);

  // ------------ Helper Functions ------------
  function makeNiivueUrl(path, commsInfo) {
    return `http://${commsInfo.host}:${commsInfo.fileServerPort}/${commsInfo.route}?${commsInfo.queryKey}=${path}`;
  }

  function toggleActive(name, value) {
    console.log(name, value);
    let newImages = images.map((image, index) => {
      if (image.name === name) {
        image.active = value;
        setActiveImage(index);
      } else {
        image.active = false;
      }
      return image;
    });
    setImages(newImages);
  }

  function handleDrop() {
    let volumes = nv.volumes;
    let newImages = volumes.map((volume, index) => {
      return {
        url: volume.url,
        name: volume.name,
        index: index,
        id: volume.id,
        color: volume.colormap,
        active: index === activeImage,
      };
    });
    console.log(newImages);
    setImages(newImages);
  }

  const handleRemove = useCallback(
    (index) => {
      let vol = nv.volumes[index];
      nv.removeVolume(vol);
      let volumes = nv.volumes;
      let newImages = volumes.map((volume, index) => {
        return {
          url: volume.url,
          name: volume.name,
          index: index,
          id: volume.id,
          color: volume.colormap,
          active: index === activeImage,
        };
      });
      setActiveImage(0);
      setImages(newImages);
    },
    [activeImage, nv]
  );

  const handleMoveUp = useCallback(
    (index) => {
      const newIndex = index - 1;
      if (newIndex < 0) {
        return;
      }

      nv.setVolume(nv.volumes[index], newIndex);
      let volumes = nv.volumes;
      let newImages = volumes.map((volume, index) => {
        return {
          url: volume.url,
          name: volume.name,
          index: index,
          id: volume.id,
          color: volume.colormap,
          active: index === activeImage,
        };
      });
      setActiveImage(0);
      setImages(newImages);
    },
    [activeImage, nv]
  );

  const handleMoveDown = useCallback(
    (index) => {
      const newIndex = index + 1;
      if (newIndex > nv.volumes.length - 1) {
        return;
      }

      nv.setVolume(nv.volumes[index], newIndex);
      let volumes = nv.volumes;
      let newImages = volumes.map((volume, index) => {
        return {
          url: volume.url,
          name: volume.name,
          index: index,
          id: volume.id,
          color: volume.colormap,
          active: index === activeImage,
        };
      });
      setActiveImage(0);
      setImages(newImages);
    },
    [activeImage, nv]
  );

  const handleShowHeader = (index) => {
    let vol = nv.volumes[index];
    alert(vol.hdr.toFormattedString());
  };

  const handleNextFrame = (index) => {
    const vol = nv.volumes[index];
    let id = vol.id;
    let currentFrame = vol.frame4D;
    nv.setFrame4D(id, currentFrame + 1);
  };

  const handlePreviousFrame = (index) => {
    const vol = nv.volumes[index];
    let id = vol.id;
    let currentFrame = vol.frame4D;
    nv.setFrame4D(id, currentFrame - 1);
  };

  const saveMosaicString = async (mosaic) => {
    console.log("mosaic:", mosaic);
    if (mosaic) {
      const result = await nvUtils.openSaveMosaicFileDialog();
      if (!result.canceled) {
        nvUtils.saveTextFile(result.filePath, mosaic);
      }
    }
  };

  const loadMosaicString = async () => {
    const result = await nvUtils.openLoadMosaicFileDialog();
    if (!result.canceled) {
      const mosaicString = await nvUtils.loadTextFile(result.filePaths[0]);
      nv.setSliceMosaicString(mosaicString);
      setMosaicString(mosaicString);
    }
  };

  const loadDocument = async () => {
    const result = await nvUtils.openFileDialog(['*.nvd']);
    if (!result.canceled) {
      const jsonString = await nvUtils.loadTextFile(result.filePaths[0]);
      const json = JSON.parse(jsonString);
      const document = NVDocument.loadFromJSON(json)
      nv.loadDocument(document);

    }
  }

  const saveDocument = async () => {
    const result = await nvUtils.openSaveFileDialog("niivue.nvd");
    if (!result.canceled) {
      const json = nv.json();
      const re = new RegExp("([^\\\\\\\\/]*$)")

      json.name = result.filePath.match(re)[0]
      let imageIndex = 0;
      for(const imageOption of json.imageOptionsArray) {
        imageOption.name = `${nv.volumes[imageIndex++].name}.nii`;
      }
      const jsonString = JSON.stringify(json)
      nvUtils.saveTextFile(result.filePath, jsonString);
    }
  }



const [progress, setProgress] = useState({ started: false, pc: 0 });
const [msg, setMsg] = useState(null);

const handleFileChange = (e) => {
  const selectedFile = e.target.files[0];
  console.log(selectedFile);
  if (!selectedFile) {
    console.log("No file selected");
    return;
  }

  const fd = new FormData();
  fd.append('file', selectedFile);
  setMsg("uploading...");
  setProgress({ started: true, pc: 0 });

  axios.post('http://localhost:9000/file', fd, {
    onUploadProgress: (progressEvent) => {
      const pc = (progressEvent.loaded / progressEvent.total) * 100;
      setProgress({ started: true, pc: pc });
    },
    headers: {
      "Custom-Header": "value",
    }
  })
  .then(res => {
    setMsg("upload complete");
    console.log(res.data);
    addVolume(res.data.path, commsInfo);
  })
  .catch(err => {
    setMsg("upload failed");
    console.log(err);
  });
};


const addPredictedVolume = useCallback(
  async () => {
    let url = `http://localhost:8050/prediction.nrrd`;
    try {
      const image = await NVImage.loadFromUrl({ url: url });
      if (image.constructor.name === "_NVImage") {
        await nv.addVolume(image);
        const volumes = nv.volumes;
        const newImages = volumes.map((volume, index) => {
          return {
            url: volume.url,
            name: volume.name,
            index: index,
            id: volume.id,
            color: volume.colormap,
            active: index === activeImage,
            frame: volume.frame4D,
            maxFrame: volume.nTotalFrame4D,
          };
        });
        setImages(newImages);
        return newImages;
      }
    } catch (error) {
      console.error("Error loading image:", error);
      return null;
    }
  },
  [activeImage, nv, setImages]
);
 const [serverResponse, setServerResponse] = useState(null);
  const [hasPredictionFile, setHasPredictionFile] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch('http://localhost:8050');
        const html = await response.text();
        setServerResponse(html);
      } catch (error) {
        console.error('Error fetching server response:', error);
        setError(error);
      }
    };

    fetchData();
  }, ['' ]);

  useEffect(() => {
    if (serverResponse) {
      // **Less secure parsing - use with caution!**
      const regex = /prediction\.nrrd/g;
      const hasPredictionFile = regex.test(serverResponse); // True if the file exists pattern is found, false otherwise
      setHasPredictionFile(hasPredictionFile);
  if (hasPredictionFile) {
    addPredictedVolume()
      .then((newImages) => {
        if (newImages) { // Check for successful image processing
          setImages(newImages);
        }
      })
      .catch((error) => {
        console.error("Error adding predicted volume:", error);
      });
  }}

  }, [serverResponse]);

// useEffect(() => {
//   console.log(hasPredictionFile)
//
// }, []); // Empty dependency array means this effect runs only once

  return (
    // wrap the app in the Niivue context
    <NV.Provider value={_nv}>
      {/* AppContainer: the parent component that lays out the rest of the scene */}
      <Container
        disableGutters
        maxWidth={false}
        sx={{
          display: "flex",
          flexDirection: "row",
          height: "100vh",
          width: "100vw",
          minHeight: "300px",
          gap: 0,
        }}
      >
        {/* CssBaseline sets some standard CSS configs for working with MUI */}
        <CssBaseline />
        {/* Sidebar: is the left panel that shows all files and image/scene widgets */}

        <Sidebar>

          <label htmlFor="fileInput" className="fileInputLabel">
            <span className="plusIcon">+</span>
          </label>
          <input
              id="fileInput"
              type="file"
              onChange={handleFileChange}
              className="fileInput"
              display="none"
          />

          {progress.started && <progress max="100" value={progress.pc}></progress>}
          {msg && <span>{msg}</span>}
          {/* FileList: shows all files in layer order */}
          <FileList>
            {/* FileItems: each FileItem is an image to be rendered in Niivue */}
            {images.map((image, index) => {
              return (
                  <FileItem
                      key={index} // unique key for React
                      name={image.name} // the name of the image (the full path on the file system)
                      active={image.active} // whether the image is the active image
                      index={index} // the index of the image in the images array
                      frame={image.frame} // the current frame of the image (for 4D images)
                      maxFrame={image.maxFrame} // the maximum frame of the image (for 4D images)
                      onSetActive={toggleActive} // callback to set if the image is active
                      onSetVisibility={setVisibility} // callback to set the visibility of the image (opacity 0 or 1)
                      onRemove={handleRemove} // callback to remove the image from the scene via the context menu
                      onMoveUp={handleMoveUp} // callback to move the image up via the context menu
                      onMoveDown={handleMoveDown} // callback to move the image down via the context menu
                      onShowHeader={handleShowHeader} // callback to show the image header via the context menu
                      onNextFrame={handleNextFrame} // advances the frame for 4D volumes
                      onPreviousFrame={handlePreviousFrame} // goes back a frame for 4D volumes
                  ></FileItem>
              );
            })}
          </FileList>
          {/* mosaic text input if sliceType is "mosaic" */}
          {sliceType === "mosaic" && <MosaicInput onChange={onMosaicChange} value={mosaicString}/>}
          {/* ImageTools */}
          <ImageTools>
            {/* colormap select: sets the colormap of the active image */}
            <ColormapSelect
                colormaps={colormaps} // array of colormap objects
                onSetColormap={updateColormapLabel} // callback to set the colormap of the active image
                colormap={colormap} // the current colormap of the active image
            />
            {/* min max input: set the min and max of the active image */}
            <MinMaxInput
                calMin={calMin} // the minimum value of the active image
                calMax={calMax} // the maximum value of the active image
                min={min} // the selected minimum value of the active image
                max={max} // the selected maximum value of the active image
                onSetMinMax={setCalMinMax} // callback to set the min and max of the active image
            />
            {/* opacity slider: set the opacity of the active image */}
            <OpacitySlider
                opacity={opacity} // the current opacity of the active image
                onSetOpacity={updateOpacity} // callback to set the opacity of the active image
            />
          </ImageTools>
          {/* SceneTools here in the future! */}
        </Sidebar>
        {/* Niivue Canvas: where things are rendered :) */}
        <NiivueCanvas nv={nv}/>
      </Container>
    </NV.Provider>
  );
}

export default App;
