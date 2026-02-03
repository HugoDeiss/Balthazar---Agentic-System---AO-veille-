#!/bin/bash
# Script de test pour simuler le build Mastra Cloud

set -e  # Arrêter en cas d'erreur

echo "🔍 DIAGNOSTIC - Versions Mastra installées"
echo "=========================================="
echo "D'après package-lock.json:"
echo "  - @mastra/core: 0.24.9"
echo "  - mastra: 0.18.9"
echo ""

echo "🧹 Étape 1: Nettoyage..."
rm -rf .mastra
echo "✅ .mastra supprimé"
echo ""

echo "📦 Étape 2: Installation production (comme Mastra Cloud avec --omit=dev)..."
if [ -d "node_modules" ]; then
  echo "⚠️  node_modules existe déjà, on le garde pour le test"
else
  npm install --omit=dev
fi
echo ""

echo "🔍 Étape 3: Vérification des externals dans node_modules..."
EXTERNALS=("xmlbuilder" "rss-parser" "@supabase/supabase-js" "resend")
ALL_PRESENT=true

for pkg in "${EXTERNALS[@]}"; do
  # Gérer le cas spécial de @supabase/supabase-js
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
  echo "⚠️  ATTENTION: Certains externals sont manquants !"
  echo "   Cela peut causer des erreurs lors du déploiement Cloud."
  echo ""
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

echo "🔍 Étape 5: Vérification du bundle généré..."
if grep -q "xmlbuilder" .mastra/output/*.mjs 2>/dev/null; then
  echo "  ✅ xmlbuilder référencé dans le bundle (comme external)"
else
  echo "  ⚠️  xmlbuilder non trouvé dans le bundle"
fi

if grep -q "rss-parser" .mastra/output/*.mjs 2>/dev/null; then
  echo "  ✅ rss-parser référencé dans le bundle (comme external)"
else
  echo "  ⚠️  rss-parser non trouvé dans le bundle"
fi

if grep -q "@supabase/supabase-js" .mastra/output/*.mjs 2>/dev/null; then
  echo "  ✅ @supabase/supabase-js référencé dans le bundle (comme external)"
else
  echo "  ⚠️  @supabase/supabase-js non trouvé dans le bundle"
fi

if grep -q "resend" .mastra/output/*.mjs 2>/dev/null; then
  echo "  ✅ resend référencé dans le bundle (comme external)"
else
  echo "  ⚠️  resend non trouvé dans le bundle"
fi

echo ""
echo "📋 Étape 6: Résumé des findings..."
echo "=========================================="
echo "Versions:"
echo "  - @mastra/core: 0.24.9"
echo "  - mastra: 0.18.9"
echo ""
echo "Externals configurés:"
echo "  - xmlbuilder (dépendance transitive, pas dans package.json)"
echo "  - rss-parser (✅ dans dependencies)"
echo "  - @supabase/supabase-js (✅ dans dependencies)"
echo "  - resend (✅ dans dependencies)"
echo ""
echo "⚠️  PROBLÈME POTENTIEL:"
echo "   xmlbuilder n'est PAS dans vos dependencies mais est listé comme external."
echo "   Si c'est une dépendance transitive, elle peut ne pas être installée"
echo "   avec 'npm ci --omit=dev' en production."
echo ""
echo "💡 RECOMMANDATION:"
echo "   Ajoutez xmlbuilder explicitement dans dependencies si nécessaire,"
echo "   ou vérifiez quelle dépendance l'apporte et assurez-vous qu'elle est"
echo "   installée en production."
echo ""
echo "✅ Test terminé. Le build a réussi."
echo ""
echo "Pour tester l'exécution (nécessite les variables d'env):"
echo "  node .mastra/output/index.mjs"
