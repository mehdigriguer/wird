# Wird

Un site personnel pour suivre les sourates mémorisées et organiser leur révision pendant les prières. Interface en français, pensée pour téléphone et ordinateur.

## Démarrer

Node.js 22.12+ (ou 24+) et npm.

```bash
cd /Users/mehdi.griguer/Perso/Wird
npm ci
npm run dev -- --port 5173 --strictPort
```

Ouvrir <http://127.0.0.1:5173>. Conserver cette adresse : `localhost`, `127.0.0.1` et un autre port ont des sauvegardes distinctes dans le navigateur.

```bash
npm test
npm run test:browser  # première fois : npx playwright install chromium
npm run build
npm run preview
```

Le build dans `dist/` peut être servi par un hébergement statique. Aucun backend, compte, tracking ou appel API à l’utilisation. Les polices sont hébergées avec le site. Le serveur doit rester accessible : cette version ne contient pas de service worker pour le chargement hors connexion.

## Utilisation

1. Sélectionner les sourates connues et indiquer **du verset… au verset…**, par exemple Al-Baqarah 1 à 40. Le bouton **Toute la sourate** sélectionne tous ses versets.
2. Consulter les références proposées pour chaque rakaat.
3. Après la prière, valider les passages réellement récités. Si la révision n’a pas été faite, utiliser **Reporter** : le cycle ne progresse pas et les passages restent à réviser.
4. Ajouter les nawafil du jour si souhaité, en choisissant leur position, leur nombre de rakaat et leur plafond.

Une plage continue est prise en charge par sourate, y compris une portion qui ne commence pas au verset 1. Les statistiques distinguent les sourates entières de celles en cours d’apprentissage et comptent uniquement les versets déclarés appris.

Avant de valider, chaque rakaat de la prière active propose **Finir au verset…** pour étendre ou raccourcir son passage (override manuel) : extension possible au-delà du plafond d’1 page, mais jamais au-delà du thème en cours, de la sourate ou des versets appris. Les rakaat suivantes de la prière sont replanifiées en conséquence et le cycle avance jusqu’au verset choisi. L’override est ponctuel et ne change pas les plafonds par défaut.

La validation porte sur tous les passages indiqués pour une prière. Il n’y a pas encore de validation partielle par rakaat. La dernière action du jour peut être annulée tant que les sourates et leurs portions n’ont pas changé.

## Règles du programme

| Prière                    | Rakaat avec passage de révision | Plafond par rakaat |
| ------------------------- | ------------------------------: | -----------------: |
| Fajr avant Subh           |                               2 |             1 page |
| Subh                      |                               2 |             1 page |
| Dhuhr, Asr, Maghreb, Isha |             2 premières chacune |             1 page |
| Chafaa                    |                               2 |             1 page |
| Witr                      |                               1 |             1 page |
| Nawafil du jour           |            2 à 12, par pas de 2 |             1 page |

- Quantité réglable à ¼, ½ ou 1 page pour chaque prière. **1 page par défaut partout.** Les plafonds déjà enregistrés dans une sauvegarde existante sont conservés.
- Une seule sourate par rakaat, même si elle est courte.
- Ordre du Quran, en ne parcourant que les versets déclarés appris dans les sourates sélectionnées. Un passage ne dépasse jamais la fin de la portion connue.
- Al-Fatiha compte dans la mémorisation, mais pas dans la rotation après Al-Fatiha.
- Versets entiers uniquement. Pour Al-Kahf, les sous-passages documentés restent aussi entiers et une rakaat ne mélange pas deux thèmes. Un passage trop long attend un plafond suffisant, sans être sauté. Un blocage de tout le programme habituel est signalé.
- Les passages déjà validés ne changent pas quand les quantités sont ajustées.
- Un cycle terminé redémarre immédiatement, y compris entre deux rakaat d’une même prière. Avec peu de sourates connues, plusieurs tours peuvent donc être terminés dans une journée.
- Modifier les sourates ou leurs portions (par exemple passer de 1–40 à 1–60) recommence le tour en cours, après confirmation. Les prières déjà validées aujourd’hui, les tours terminés et l’historique sont conservés. Enregistrer une sélection inchangée ne recommence pas le tour.
- Le changement de jour utilise la date locale du navigateur. Les nawafil du jour précédent ne sont pas reconduites. Les passages non validés restent à réviser.

### Estimation de fin

L’estimation **simule les passages**, elle ne divise pas simplement un nombre de pages par une capacité. Elle respecte donc les petites sourates isolées, les limites de chaque prière et les versets longs.

Elle utilise les prières encore disponibles aujourd’hui, nawafil incluses, puis les prières habituelles pour les jours futurs. Les jours affichés incluent aujourd’hui. Ajouter une nafila améliore la prévision, mais seule une validation fait réellement avancer le cycle. Une prière non validée conserve ses passages pour la suite.

### Découpages thématiques : prototypes documentés

L’onglet **Découpage** liste les sourates couvertes. La règle de sens est au niveau des thèmes : **une rakaat enchaîne autant de thèmes entiers que possible dans le plafond choisi, sans jamais couper un thème pour la remplir**. Les thèmes qui dépassent le plafond sont répartis par la longueur sur plusieurs rakaat, et la suite du thème reprend là où elle s’était arrêtée. Quand un gros thème se termine en cours de rakaat et que le thème suivant tient entier, il est enchaîné aussi. Les sourates sans fichier `src/data/*-sections.json` restent découpées selon la longueur seulement.

#### Al-Kahf (18)

Les huit thèmes fournis par l’utilisateur sont conservés.

| Thème                             | Versets | Sous-passages minimaux                           |
| --------------------------------- | ------- | ------------------------------------------------ |
| Introduction                      | 1–8     | 1–5, 6–8                                         |
| Gens de la caverne                | 9–26    | 9–12, 13–16, 17, 18, 19–20, 21, 22, 23–24, 25–26 |
| Rappel et récompense des croyants | 27–31   | 27–28, 29, 30–31                                 |
| Les deux propriétaires du jardin  | 32–44   | 32–36, 37–41, 42–44                              |
| Rappel sur la vie d’ici-bas       | 45–59   | 45–46, 47–49, 50, 51, 52–53, 54, 55–56, 57–59    |
| Moussa et Al-Khidr                | 60–82   | 60–65, 66–70, 71–73, 74–76, 77–78, 79, 80–81, 82 |
| Dhul-Qarnayn                      | 83–98   | 83–88, 89–91, 92–96, 97–98                       |
| Conclusion                        | 99–110  | 99–102, 103–106, 107–108, 109, 110               |

Plusieurs sous-passages d’un même thème peuvent être regroupés si leur longueur respecte le plafond. Le dernier arrêt documenté qui tient dans la rakaat est retenu, sans remplir avec le thème suivant.

**Statut : thèmes documentés à faire relire, pas validation religieuse.** Chaque fin de thème est confirmée par un arrêt/reprise QSU entre versets. Les vérifications techniques contrôlent l’extraction et les contraintes, pas la justesse religieuse du découpage. Les autres sourates restent découpées selon leur longueur seulement ; cette limite est indiquée dans l’interface.

#### Sources et méthode

- Grands thèmes : découpage fourni par l’utilisateur.
- Regroupements de versets : [Ibn Kathir (Abridged), Quran.com](https://quran.com/18:1/tafsirs/en-tafisr-ibn-kathir), API publique, ressource 169.
- Arrêts/reprises entre versets : [QSU: Quran Semantic Units Dataset, version 1](https://data.mendeley.com/datasets/v7hyhk7krd/1), Hawash, Abdelraouf Abdelmonem ; Medhat, Tamer ; Shams, Mahmoud ; Mahmoud, Nora. DOI : `10.17632/v7hyhk7krd.1`.

Les fins de thèmes sont retenues seulement si QSU confirme un arrêt complet en fin de verset (`unit_ends=yes` au dernier mot) et une reprise au verset suivant (`unit_begins=yes`). Les arrêts intra-verset et les marqueurs ambigus (`both`) sont exclus. Quand les sources divergent sur une frontière (ex : 31–36 / 37–40 pour An-Naba), la frontière contestée est supprimée et les thèmes sont fusionnés.

Le JSON conserve les URL, la date de récupération, les groupes du tafsir, les arrêts QSU et le SHA-256 de `WBS.csv`. Aucun texte coranique ou texte du tafsir n’est embarqué par cette extraction.

**Licence des données dérivées de QSU : [CC BY-NC 3.0](https://creativecommons.org/licenses/by-nc/3.0/). Usage non commercial uniquement.** Cette contrainte concerne les données dérivées, pas une attribution de licence au reste du code. Ne pas utiliser ces données dans un produit commercial sans autorisation ou source de remplacement.

Pour reproduire l’extraction des deux sourates (Python 3 et `curl`, sans package Python supplémentaire) :

```bash
npm run data:sections
npm test
```

Le script traite chaque `src/data/*-sections.json` et refuse une source QSU dont le checksum a changé. Tout changement de repères nécessite une review des données, pas seulement des tests qui passent.

#### Al-Mulk (67)

Trois thèmes fournis par l’utilisateur, fins confirmées par QSU (5, 14, 30).

| Thème                                                                   | Versets |
| ----------------------------------------------------------------------- | ------- |
| La souveraineté d’Allah, la création et l’épreuve de la vie             | 1–5     |
| Le châtiment des mécréants et la récompense de ceux qui craignent Allah | 6–14    |
| La dépendance des hommes envers Allah et le rappel du Jugement          | 15–30   |

Le thème 15–30 dépasse 1 page : le programme le répartit par la longueur à l’intérieur du thème, choix assumé.

#### An-Naba (78)

Trois thèmes dérivés des sections d’Ibn Kathir. L’API `by_ayah` retourne des groupes tronqués pour cette sourate (1–10 au lieu de 1–16, avec repli sur l’entrée précédente) : les 4 sections réelles (1–16, 17–30, 31–36, 37–40) ont été vérifiées en lisant le texte des entrées. Les deux dernières sont fusionnées en 31–40, car QSU ne confirme aucune reprise au verset 37 (son unité 35–38 traverse cette limite).

| Thème                                                       | Versets |
| ----------------------------------------------------------- | ------- |
| Le grand événement et la puissance d’Allah dans la création | 1–16    |
| Le Jour de la Décision et le sort des transgresseurs        | 17–30   |
| Le succès des pieux et la proximité du Jugement             | 31–40   |

Chaque bloc tient dans ½ page (calcul vérifié sur les lignes du mushaf) et reste indivisible.

#### Portions apprises et ancien avancement

- Une portion apprise qui finit au milieu d’un thème s’arrête simplement au dernier verset connu. Aucun verset non appris n’est ajouté, aucun conflit n’est signalé.
- Une portion qui commence au milieu d’un thème commence exactement là.
- Un verset seul trop long pour le plafond reste à réviser pour une prière avec un plafond suffisant, sans dépasser 1 page.
- Les anciennes validations ne sont pas réécrites : elles gardent leur libellé d’origine. Les nouvelles validations enregistrent l’identifiant du découpage utilisé.

### Pagination et limites

Les références proviennent de l’API publique Quran.com v4 : `chapters` et `verses/by_chapter`, avec `words`, `page_number` et `line_number`.

- Source et date de récupération sont incluses dans `src/data/quran.json`.
- 114 sourates, 6 236 versets, mushaf de Médine à 604 pages.
- Le fichier contient seulement les noms et les positions des versets, pas de texte coranique généré.
- La longueur est mesurée en lignes du mushaf, sur 15 lignes par page. Les deux premières pages utilisent l’étendue de leurs lignes de texte, afin de ne pas considérer toute leur surface de texte comme une simple demi-page.
- Les lignes partielles au début et à la fin d’un passage sont comptées entières. Le découpage est volontairement conservateur : ½ page sur une page normale signifie au plus 7 lignes, ¼ page au plus 3 lignes.
- Une fin de verset n’est pas une recommandation religieuse sur les endroits où s’arrêter. Vérifier les passages dans son mushaf.

Documentation : <https://api-docs.quran.com/docs/content_apis_versioned/4.0.0/verses-by-chapter-number/>

Pour actualiser les métadonnées, explicitement et hors du navigateur :

```bash
npm run data:refresh
npm test
```

Le script vérifie la présence de tous les versets avant d’écrire le fichier. Les tests vérifient aussi les positions, des références repères et tous les points de départ avec chaque plafond. Cela ne remplace pas une vérification humaine du mushaf.

## Données personnelles

Sauvegarde dans `localStorage`, clé `wird.progress.v1` conservée pour retrouver les données existantes. Le format des nouvelles sauvegardes est la version 2, avec les portions dans `ranges`.

Les sauvegardes de version 1 sont converties à la lecture : leurs sourates restent entièrement mémorisées, et la position du cycle, les réglages et l’historique sont conservés. Les anciens exports JSON restent importables.

- Aucune donnée n’est envoyée à un serveur.
- Pas de synchronisation entre appareils. Les onglets de la même adresse reçoivent les mises à jour du stockage.
- Export/import JSON dans **Réglages**. L’import demande confirmation et vérifie la structure avant remplacement.
- Une sauvegarde illisible n’est pas remplacée automatiquement. Un écran de récupération permet de télécharger les données brutes.
- Si le navigateur refuse une écriture, un avertissement demande d’exporter les changements avant de fermer l’onglet.
- Effacer le stockage du navigateur, changer de navigateur ou changer l’adresse du site peut faire perdre l’accès à la progression. Faire des exports réguliers.

## Structure

- `src/planner.js` : calcul pur, simulation et transitions de progression.
- `src/storage.js` : validation et sauvegardes.
- `src/sections.js` : accès aux thèmes d’Al-Kahf et explication des conflits.
- `src/data/*-sections.json` : thèmes, coupures, sources et preuves d’extraction, par sourate couverte.
- `scripts/fetch-sections.py` : extraction ciblée et reproductible des repères de toutes les sourates couvertes.
- `src/App.jsx` : interface et actions.
- `src/data/quran.json` : positions des versets, embarquées localement.
- `tests/planner.test.js` : règles de calcul, limites, dates et imports.
- `tests/browser/app.spec.js` : parcours réels sur mobile et desktop.

Polices DM Sans et Manrope : Google Fonts, licences SIL Open Font License dans `public/fonts/`.
