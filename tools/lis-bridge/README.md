# Ayuva LIS bridge

Connects a lab analyser to Ayuva so results flow into the Report Builder
without typing.

Analysers speak **HL7 v2 over MLLP** or **ASTM E1394 / CLSI LIS2-A2**
(E1381 framing) on the lab network. Ayuva is only reachable over HTTPS. The
bridge runs on a PC in the lab and joins the two. It:

1. accepts the analyser's connection;
2. rebuilds each complete message;
3. sends it to Ayuva with the analyser's key;
4. answers the analyser (HL7 ACK, or ASTM ACK per frame).

## What happens in Ayuva

1. Each result is matched to an order by the **vial barcode**. That's the
   sample ID the analyser reads from the tube: Ayuva's printed vial labels, or
   a pre-printed tube scanned into the order.
2. The analyser's test code (`GLU`, `HGB`, …) is mapped to a report parameter
   under **Laboratory → Analysers**.
3. A matched value fills the blank on the report, then goes through the same
   steps as a typed value: flags, delta and contamination checks, and
   critical-value alerts.
4. **A value someone already entered is never overwritten.** The interface log
   lists every skip with the reason.
5. A pathologist still signs the report off.

## Set up

1. In the portal go to **Laboratory → Analysers → Add analyser**. Choose
   HL7 or ASTM and copy the **bridge key**. It is shown once; you can replace
   it later.
2. Map each test code the analyser sends to the parameter name on your
   reports.
3. On the bridge PC (Node.js 18 or newer):

   ```sh
   set AYUVA_INGEST_URL=https://<your-ayuva-api>/api/v1/lis/ingest
   set AYUVA_ANALYSER_KEY=ayk_…
   set PROTOCOL=hl7          # or astm
   set PORT=2575             # the port the analyser connects to
   node bridge.mjs
   ```

4. In the analyser's LIS / host settings, set the host to the bridge PC's IP,
   the port above, and the matching protocol, with the analyser as the TCP
   client.
5. Run one sample, then check **Laboratory → Analysers → Messages**.

Run one bridge per analyser, each with its own key and port. To keep it
running, install it as a service: NSSM on Windows, or a systemd unit on
Linux.

## Notes

- **Serial-only analysers** (RS-232): use a serial-to-Ethernet converter in
  TCP server/client mode, so the analyser's port appears as TCP.
- If Ayuva can't be reached, messages wait in `./outbox` and are retried
  every minute. The analyser is still acknowledged, so it doesn't resend.
- Treat the key like a password. Anyone holding it can post results for
  that analyser. Replace it in the portal if it leaks.
- Order download (host query: the analyser asking which tests a tube needs)
  is not supported yet. Tests are run as programmed on the analyser.
