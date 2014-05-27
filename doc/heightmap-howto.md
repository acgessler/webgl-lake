Convert .hgt files to .png (Windows)
======================

 - `gdal_translate` is part of `ms4w_3.0.6`. Download the ZIP from http://www.maptools.org/ms4w/index.phtml and unpack.
 - `setenv.bat` (in ms4w root) does not work for me. Copying all from `tools/gdal-ogr` to `Apache/cgi-bin` and running from there makes all DLLs available.
 - `gdal_translate src.hgt dest.png -of PNG`
