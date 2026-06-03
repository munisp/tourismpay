{{/*
Expand the name of the chart.
*/}}
{{- define "insurance-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "insurance-platform.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "insurance-platform.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "insurance-platform.labels" -}}
helm.sh/chart: {{ include "insurance-platform.chart" . }}
{{ include "insurance-platform.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: unified-insurance-platform
{{- end }}

{{/*
Selector labels
*/}}
{{- define "insurance-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "insurance-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "insurance-platform.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "insurance-platform.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Create image name
*/}}
{{- define "insurance-platform.image" -}}
{{- $registry := .Values.global.imageRegistry -}}
{{- $repository := .repository -}}
{{- $tag := .tag | default $.Values.image.tag | default $.Chart.AppVersion -}}
{{- printf "%s/%s:%s" $registry $repository $tag -}}
{{- end }}

{{/*
Create database URL
*/}}
{{- define "insurance-platform.databaseUrl" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "postgresql://%s:%s@%s-postgresql:5432/%s" .Values.postgresql.auth.username "$(POSTGRES_PASSWORD)" (include "insurance-platform.fullname" .) .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.externalDatabase.url }}
{{- end }}
{{- end }}

{{/*
Create Redis URL
*/}}
{{- define "insurance-platform.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- printf "redis://:%s@%s-redis-master:6379" "$(REDIS_PASSWORD)" (include "insurance-platform.fullname" .) }}
{{- else }}
{{- .Values.externalRedis.url }}
{{- end }}
{{- end }}

{{/*
Create Kafka brokers
*/}}
{{- define "insurance-platform.kafkaBrokers" -}}
{{- if .Values.kafka.enabled }}
{{- printf "%s-kafka:9092" (include "insurance-platform.fullname" .) }}
{{- else }}
{{- .Values.externalKafka.brokers }}
{{- end }}
{{- end }}
