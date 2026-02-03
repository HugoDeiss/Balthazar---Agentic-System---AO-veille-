#!/bin/bash
# Script de test pour valider le build en conditions "cloud-like"

set -e  # Arrêter en cas d'erreur

echo "🧹 Étape 1: Nettoyage complet..."
rm -rf .mastra node_modules package-lock.json
echo "✅ Nettoyage terminé"
echo ""

echo "📦 Étape 2: Installation production (comme Mastra Cloud avec --omit=dev)..."
npm install --omit=dev
echo "✅ Installation terminée"
echo ""

echo "🔍 Étape 3: Vérification des externals dans node_modules..."
EXTERNALS=("xmlbuilder" "rss-parser" "@supabase/supabase-js" "resend")
ALL_PRESENT=true

for pkg in "${EXTERNALS[@]}"; do
  if [ "$pkg" == "@supabase/supabase-js" ]; then
    if [ -d "node_modules/@supabase/supabase-js" ]; then
      echo "  ✅ $pkg trouvé"
    else
      echo "  ❌ $pkg MANQUANT"
      ALL_PRESENT=false
    fi
  else
    if [ -d "node_modules/$pkg" ]; then
      echo "  ✅ $pkg trouvé"
    else
      echo "  ❌ $pkg MANQUANT"
      ALL_PRESENT=false
    fi
  fi
done

if [ "$ALL_PRESENT" = false ]; then
  echo ""
  echo "❌ ERREUR: Certains externals sont manquants !"
  exit 1
fi

echo ""
echo "🔨 Étape 4: Build Mastra..."
npx mastra build --dir src/mastra

if [ ! -f ".mastra/output/index.mjs" ]; then
  echo "❌ ERREUR: Le fichier .mastra/output/index.mjs n'existe pas après le build"
  exit 1
fi

echo "✅ Build réussi"
echo ""

echo "📋 Résumé:"
echo "  ✅ Tous les externals sont présents"
echo "  ✅ Build Mastra réussi"
echo "  ✅ Fichier .mastra/output/index.mjs généré"
echo ""
echo "✅ Test terminé avec succès !"
echo ""
echo "Pour tester l'exécution (nécessite les variables d'env configurées):"
echo "  node --import=./.mastra/output/instrumentation.mjs .mastra/output/index.mjs"
