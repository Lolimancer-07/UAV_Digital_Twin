#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <math.h>
#include <time.h>
#include "MQTTClient.h"

#define ADDRESS     "tcp://localhost:1883"
#define CLIENTID    "UAV_Engine_Node"
#define TOPIC       "uav/engine/telemetry"
#define QOS         0
#define TIMEOUT     10000L
#define MAX_RUL     260.0f   /* Approximate max life in FD001 dataset */

/* ---------- Physics helpers ------------------------------------------- */

/* Box-Muller: Gaussian noise N(mean, stddev) */
static float gaussian(float mean, float stddev) {
    float u1 = ((float)rand() + 1.0f) / ((float)RAND_MAX + 1.0f);
    float u2 = ((float)rand() + 1.0f) / ((float)RAND_MAX + 1.0f);
    float z  = sqrtf(-2.0f * logf(u1)) * cosf(2.0f * 3.14159265f * u2);
    return mean + z * stddev;
}

static float clampf(float v, float lo, float hi) {
    return v < lo ? lo : (v > hi ? hi : v);
}

/* ---------- Main ------------------------------------------------------- */

int main(int argc, char* argv[]) {
    srand((unsigned int)time(NULL));

    MQTTClient client;
    MQTTClient_connectOptions conn_opts = MQTTClient_connectOptions_initializer;
    int rc;

    MQTTClient_create(&client, ADDRESS, CLIENTID,
                      MQTTCLIENT_PERSISTENCE_NONE, NULL);
    conn_opts.keepAliveInterval = 20;
    conn_opts.cleansession      = 1;

    if ((rc = MQTTClient_connect(client, &conn_opts)) != MQTTCLIENT_SUCCESS) {
        printf("[ECU] Failed to connect to MQTT broker (rc=%d)\n", rc);
        printf("[ECU] Run: sudo systemctl start mosquitto\n");
        exit(EXIT_FAILURE);
    }
    printf("[ECU] Connected to MQTT Broker at %s\n", ADDRESS);

    /* Path is relative to UAV_Digital_Twin root (run from there) */
    FILE *file = fopen("data/telemetry_ready.csv", "r");
    if (!file) {
        printf("[ECU] Error: Cannot open 'data/telemetry_ready.csv'\n");
        exit(EXIT_FAILURE);
    }

    char  line[512];
    char  payload[1024];

    /* Skip CSV header */
    fgets(line, sizeof(line), file);

    printf("[ECU] Telemetry stream started at 10 Hz\n\n");

    while (fgets(line, sizeof(line), file)) {
        int   engine_id, cycle;
        float rpm, cht, egt, rul;

        if (sscanf(line, "%d,%d,%f,%f,%f,%f",
                   &engine_id, &cycle, &rpm, &cht, &egt, &rul) != 6)
            continue;

        /* ---- Degradation factor: 0.0 (new) → 1.0 (end of life) ---- */
        float deg = clampf(1.0f - (rul / MAX_RUL), 0.0f, 1.0f);

        /* ---- Physics-informed synthetic sensors -------------------- */

        /* Oil pressure (PSI): 65 when healthy → 35 near failure       */
        float oil_pressure = clampf(
            65.0f - (deg * 30.0f) + gaussian(0.0f, 1.5f), 10.0f, 80.0f);

        /* Fuel flow (L/hr): proportional to RPM                       */
        float fuel_flow = clampf(
            (rpm / 1400.0f) * 8.5f + gaussian(0.0f, 0.15f), 0.5f, 15.0f);

        /* Vibration (g RMS): 0.3g nominal → 3.5g near failure         */
        float vibration = clampf(
            0.3f + (deg * 3.2f) + gaussian(0.0f, 0.08f), 0.0f, 10.0f);

        /* Battery / alternator voltage (V): 13.8V nominal → drops     */
        float battery_v = clampf(
            13.8f - (deg * 0.8f) + gaussian(0.0f, 0.05f), 11.0f, 15.0f);

        /* Injection timing advance (deg BTDC): retards as wear grows   */
        float inj_timing = clampf(
            28.0f - (deg * 8.0f) + gaussian(0.0f, 0.3f), 10.0f, 35.0f);

        /* ---- Fault injection at very low RUL for demo realism ------ */
        if (rul < 15.0f && ((rand() % 10) < 2)) {
            /* Occasional misfire: RPM dip + EGT spike                 */
            rpm  -= gaussian(80.0f, 20.0f);
            egt  += gaussian(50.0f, 15.0f);
            vibration += 1.0f;
        }

        /* ---- Build JSON payload ------------------------------------ */
        snprintf(payload, sizeof(payload),
            "{"
            "\"engine_id\":%d,"
            "\"cycle\":%d,"
            "\"rpm\":%.2f,"
            "\"cht\":%.2f,"
            "\"egt\":%.2f,"
            "\"oil_pressure\":%.2f,"
            "\"fuel_flow\":%.3f,"
            "\"vibration\":%.4f,"
            "\"battery_v\":%.2f,"
            "\"inj_timing\":%.2f,"
            "\"true_rul\":%.0f"
            "}",
            engine_id, cycle,
            rpm, cht, egt,
            oil_pressure, fuel_flow, vibration, battery_v, inj_timing,
            rul);

        MQTTClient_message pubmsg = MQTTClient_message_initializer;
        pubmsg.payload    = payload;
        pubmsg.payloadlen = (int)strlen(payload);
        pubmsg.qos        = QOS;
        pubmsg.retained   = 0;

        MQTTClient_publishMessage(client, TOPIC, &pubmsg, NULL);
        printf("Tx [E%02d C%04d] RUL=%.0f | RPM=%.0f CHT=%.1f EGT=%.1f "
               "OIL=%.1f VIB=%.2f\n",
               engine_id, cycle, rul, rpm, cht, egt, oil_pressure, vibration);

        usleep(100000);   /* 10 Hz */
    }

    fclose(file);
    MQTTClient_disconnect(client, 10000);
    MQTTClient_destroy(&client);
    printf("\n[ECU] Telemetry stream complete.\n");
    return 0;
}