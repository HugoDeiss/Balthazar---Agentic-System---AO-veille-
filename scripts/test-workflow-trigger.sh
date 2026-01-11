#!/bin/bash

# ============================================
# Script de test pour le déclenchement du workflow AO Veille
# ============================================

set -e

# Couleurs pour les logs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Test du déclenchement du workflow AO Veille${NC}"
echo ""

# Vérifier les variables d'environnement
if [ -z "$MASTRA_CLOUD_URL" ]; then
  echo -e "${RED}❌ Erreur: MASTRA_CLOUD_URL n'est pas défini${NC}"
  echo "Définissez-le avec: export MASTRA_CLOUD_URL=https://votre-projet.mastra.ai"
  exit 1
fi

if [ -z "$BALTHAZAR_CLIENT_ID" ]; then
  echo -e "${RED}❌ Erreur: BALTHAZAR_CLIENT_ID n'est pas défini${NC}"
  echo "Définissez-le avec: export BALTHAZAR_CLIENT_ID=votre-client-id"
  exit 1
fi

# Calculer la date d'hier
SINCE=$(date -d '1 day ago' '+%Y-%m-%d' 2>/dev/null || date -v-1d '+%Y-%m-%d')

echo -e "${BLUE}📋 Configuration:${NC}"
echo "  URL Mastra Cloud: $MASTRA_CLOUD_URL"
echo "  Client ID: $BALTHAZAR_CLIENT_ID"
echo "  Date de recherche: $SINCE"
echo ""

# Construire le payload JSON
PAYLOAD=$(cat <<EOF
{
  "inputData": {
    "clientId": "$BALTHAZAR_CLIENT_ID",
    "since": "$SINCE"
  }
}
EOF
)

echo -e "${YELLOW}📤 Envoi de la requête...${NC}"
echo ""

# Faire la requête
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$MASTRA_CLOUD_URL/api/workflows/aoVeilleWorkflow/run")

# Extraire le code HTTP et le body
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo -e "${BLUE}📊 Réponse:${NC}"
echo "  Code HTTP: $HTTP_CODE"
echo ""

# Vérifier le succès
if [ "$HTTP_CODE" = "200" ]; then
  echo -e "${GREEN}✅ Succès !${NC}"
  echo ""
  echo -e "${BLUE}📦 Détails de la réponse:${NC}"
  echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
  echo ""
  echo -e "${GREEN}🎉 Le workflow a été déclenché avec succès !${NC}"
  exit 0
else
  echo -e "${RED}❌ Échec !${NC}"
  echo ""
  echo -e "${RED}📦 Réponse d'erreur:${NC}"
  echo "$BODY"
  echo ""
  echo -e "${RED}💡 Vérifiez:${NC}"
  echo "  1. Que l'URL Mastra Cloud est correcte"
  echo "  2. Que le workflow est bien déployé sur Mastra Cloud"
  echo "  3. Que le client existe dans Supabase"
  exit 1
fi

