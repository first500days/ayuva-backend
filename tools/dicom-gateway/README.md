# Ayuva DICOM gateway: scanners and PACS

This sends CT, MRI, X-ray and ultrasound images straight from scanners to the
lab order they belong to. Nobody has to upload files by hand.

Scanners speak DICOM (C-STORE, usually port 104 or 4242) on the lab network.
Ayuva can only be reached over HTTPS. An on-site gateway joins the two:

```
scanner --DICOM C-STORE--> Orthanc (lab PC) --HTTPS, DICOMweb STOW-RS--> Ayuva
```

[Orthanc](https://www.orthanc-server.com/) is free and open source, and runs
on Windows or Linux. Any gateway or PACS that can send DICOMweb STOW-RS with
a custom header works the same way.

## What happens in Ayuva

1. The image's **Accession Number** (0008,0050) must be the Ayuva order
   number, for example `LAB-261108-AB12`. Enter it at the scanner, or from
   the scanner's worklist.
2. Ayuva checks that the patient on the image is the patient on the order. It
   compares the name (0010,0010), and the birth date (0010,0030) where both
   sides have one. **A mismatched or unnamed image is refused, not attached.**
   This way a mistyped accession number can't put one person's scan on
   another's order. The refusal shows in the gateway's log and under
   **Laboratory → Analysers → Messages**. Correct it at the scanner and send
   it again.
3. Matching images are attached to the order. They open in the Imaging
   Viewer and in the patient's Imaging tab, like an upload.
4. An image that was already received is not stored twice.

## Set up

1. In the portal go to **Laboratory → Analysers → Add**, choose **DICOM
   gateway** and copy the key. It is shown once.
2. Install Orthanc on a PC on the lab network, with its DICOMweb plugin
   (included in the Windows installer).
3. In Orthanc's configuration (`orthanc.json`):

   ```json
   {
     "DicomAet": "AYUVA",
     "DicomPort": 4242,
     "DicomWeb": {
       "Enable": true,
       "Servers": {
         "ayuva": {
           "Url": "https://<your-ayuva-api>/api/v1/dicomweb-ingest/",
           "HttpHeaders": { "x-analyser-key": "ayk_…" }
         }
       }
     },
     "LuaScripts": ["ayuva-forward.lua"]
   }
   ```

4. Next to it, `ayuva-forward.lua` sends every study on once the scanner has
   finished sending it:

   ```lua
   function OnStableStudy(studyId, tags, metadata)
     RestApiPost('/dicom-web/servers/ayuva/stow', DumpJson({ Resources = { studyId } }, true))
   end
   ```

5. On each scanner, add Orthanc as a DICOM destination: its IP address,
   port 4242 and AE title `AYUVA`.
6. Send one study, then check **Laboratory → Analysers → Messages**.

## Limits and network

- Each request may carry up to 100 MB. A larger request gets HTTP 413. Use
  `OnStableSeries` in place of `OnStableStudy` so that each series goes on
  its own, or lower the batch size in the DICOMweb plugin's settings.
- The gateway only needs to reach the Ayuva API on outbound port 443. Keep
  its DICOM port open to the scanners only, never to the internet.
- Treat the key like a password. Replace it in the portal if it leaks.
- Not built yet: a Modality Worklist that sends order numbers to the
  scanners automatically. Until then the accession number is entered at the
  scanner.
