<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\BiosController;
use App\Http\Controllers\DarkController;
use App\Http\Controllers\E2eController;
use App\Http\Controllers\GamesController;
use App\Http\Controllers\InternalController;
use App\Http\Controllers\InviteController;
use App\Http\Controllers\PerfController;
use App\Http\Controllers\PhoneController;
use App\Http\Controllers\SessionController;
use App\Http\Controllers\UploadsController;
use App\Http\Controllers\VortexOSController;
use App\Http\Controllers\WorldController;
use Illuminate\Support\Facades\Route;

// Yutopia's API. Everything is under /api (same origin as the client in production).
// A plain throttle:N,M counts per person across every route that uses the same
// numbers, so the busy ones (a disc's hundred pieces) have prefixes of their own.

Route::middleware('throttle:auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
});

Route::middleware('throttle:api')->group(function () {
    Route::get('/config', [AuthController::class, 'config']);
    Route::get('/invites/{code}', [AuthController::class, 'invite'])->where('code', '[A-Za-z0-9]{8,40}');
});

Route::middleware(['auth:sanctum', 'throttle:api'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::post('/session', SessionController::class)->middleware('throttle:60,1,session');

    Route::get('/avatar', [WorldController::class, 'showAvatar']);
    Route::put('/avatar', [WorldController::class, 'updateAvatar']);
    Route::get('/setups', [WorldController::class, 'setups']);
    Route::post('/setups', [WorldController::class, 'saveSetup'])->middleware('throttle:30,1,setups');
    Route::delete('/setups/{setupId}', [WorldController::class, 'deleteSetup'])->whereNumber('setupId');
    Route::get('/members', [WorldController::class, 'members']);

    // VortexOS on the computers: sign in with Yutopia (a one-time code its backend redeems)
    Route::post('/vortexos/handoff', [VortexOSController::class, 'handoff'])->middleware('throttle:30,1,vortexos');

    // the game room: the cartridges and discs people bring, and the saves of what's played
    Route::get('/games', [GamesController::class, 'index']);
    Route::post('/games', [GamesController::class, 'store'])->middleware('throttle:20,1,games');
    Route::delete('/games/{gameId}', [GamesController::class, 'destroy'])->whereNumber('gameId');
    Route::get('/games/{gameId}/rom', [GamesController::class, 'rom'])->whereNumber('gameId')->middleware('throttle:60,1,rom');
    // bringing a game in chunks (discs: hundreds of MB, maybe a .cue and its tracks)
    Route::post('/games/uploads', [UploadsController::class, 'start'])->middleware('throttle:20,1,uploads');
    Route::get('/games/uploads/{uploadId}', [UploadsController::class, 'show']);
    Route::post('/games/uploads/{uploadId}/finish', [UploadsController::class, 'finish'])->middleware('throttle:20,1,uploads');
    Route::delete('/games/uploads/{uploadId}', [UploadsController::class, 'cancel']);
    // the disc console's BIOS (known retail dumps only)
    Route::get('/bios', [BiosController::class, 'index']);
    Route::post('/bios', [BiosController::class, 'store'])->middleware('throttle:20,1,bios');
    Route::get('/bios/{biosId}/file', [BiosController::class, 'file'])->whereNumber('biosId')->middleware('throttle:60,1,bios-file');
    Route::delete('/bios/{biosId}', [BiosController::class, 'destroy'])->whereNumber('biosId');
    Route::get('/saves/{game}', [GamesController::class, 'saveInfo']);
    Route::get('/saves/{game}/{kind}', [GamesController::class, 'saveFile'])->whereIn('kind', ['state', 'sram']);
    Route::post('/saves/{game}', [GamesController::class, 'putSave'])->middleware('throttle:60,1,saves');

    // the e2e suite's fixtures (YUTOPIA_E2E=1 only)
    Route::post('/e2e/world', [E2eController::class, 'world']);

    Route::middleware('admin')->prefix('admin')->group(function () {
        // how the game runs for everyone (docs/plan/39-the-telemetry.md)
        Route::get('/perf/summary', [PerfController::class, 'summary']);
        Route::get('/perf/player/{user}', [PerfController::class, 'player'])->whereNumber('user');
        Route::get('/perf/spots', [PerfController::class, 'spots']);
        Route::get('/invites', [InviteController::class, 'index']);
        Route::post('/invites', [InviteController::class, 'store']);
        Route::delete('/invites/{invite}', [InviteController::class, 'destroy']);
    });
});

// a disc's pieces and files go out of the general ceiling (a disc alone is ~110 of them)
Route::middleware('auth:sanctum')->group(function () {
    Route::get('/games/{gameId}/files/{index}', [GamesController::class, 'file'])->whereNumber(['gameId', 'index'])->middleware('throttle:240,1,files');
    Route::put('/games/uploads/{uploadId}/{file}/{n}', [UploadsController::class, 'chunk'])->whereNumber(['file', 'n'])->middleware('throttle:600,1,chunks');
});

// the phone (docs/plan/21-cellphone.md): settings, contacts, threads, texts,
// photos, Vortex; photo files are signed URLs (an <img src> has no token)
Route::middleware(['auth:sanctum', 'throttle:api'])->prefix('phone')->group(function () {
    Route::get('/', [PhoneController::class, 'show']);
    Route::put('/', [PhoneController::class, 'update'])->middleware('throttle:60,1,phone');
    Route::get('/contacts', [PhoneController::class, 'contacts']);
    Route::post('/contacts', [PhoneController::class, 'addContact'])->middleware('throttle:30,1,contacts');
    Route::delete('/contacts/{userId}', [PhoneController::class, 'removeContact'])->whereNumber('userId');
    Route::get('/users/{userId}', [PhoneController::class, 'lookup'])->whereNumber('userId')->middleware('throttle:30,1,lookup');
    Route::get('/threads', [PhoneController::class, 'threads']);
    Route::post('/threads', [PhoneController::class, 'open'])->middleware('throttle:60,1,threads');
    Route::patch('/threads/{threadId}', [PhoneController::class, 'editThread'])->whereNumber('threadId');
    Route::delete('/threads/{threadId}/members/me', [PhoneController::class, 'leave'])->whereNumber('threadId');
    Route::get('/threads/{threadId}/messages', [PhoneController::class, 'messages'])->whereNumber('threadId');
    Route::post('/threads/{threadId}/messages', [PhoneController::class, 'send'])->whereNumber('threadId')->middleware('throttle:40,1,send');
    Route::post('/threads/{threadId}/read', [PhoneController::class, 'read'])->whereNumber('threadId');
    Route::post('/threads/{threadId}/typing', [PhoneController::class, 'typing'])->whereNumber('threadId')->middleware('throttle:40,1,typing');
    Route::post('/messages/{messageId}/react', [PhoneController::class, 'react'])->whereNumber('messageId')->middleware('throttle:60,1,react');
    Route::get('/calls', [PhoneController::class, 'calls']);
    Route::get('/photos', [PhoneController::class, 'photos']);
    Route::post('/photos', [PhoneController::class, 'upload'])->middleware('throttle:30,1,photos');
    Route::patch('/photos/{photoId}', [PhoneController::class, 'editPhoto'])->whereNumber('photoId');
    Route::post('/photos/{photoId}/keep', [PhoneController::class, 'keep'])->whereNumber('photoId')->middleware('throttle:30,1,keep');
    Route::delete('/photos/{photoId}', [PhoneController::class, 'deletePhoto'])->whereNumber('photoId');
    Route::post('/vortex', [PhoneController::class, 'vortexText'])->middleware('throttle:20,1,vortex');
    Route::post('/vortex/lines', [PhoneController::class, 'vortexLine'])->middleware('throttle:30,1,vortex-lines');
    Route::post('/vortex/call', [PhoneController::class, 'vortexCall'])->middleware('throttle:30,1,vortex-call');
});
Route::get('/photos/{photo}', [PhoneController::class, 'photoFile'])
    ->whereNumber('photo')->name('photo')->middleware('signed:relative');

// VortexOS's backend (signed with VORTEXOS_SHARED_SECRET, its own scheme)
Route::post('/internal/vortexos/handoff', [VortexOSController::class, 'redeem'])->middleware('throttle:60,1,vortexos-redeem');

// the world-server (HMAC-signed, see VerifyInternalSignature; never throttled)
Route::middleware('internal')->prefix('internal')->group(function () {
    Route::get('/ping', [InternalController::class, 'ping']);
    Route::get('/world', [InternalController::class, 'world']);
    Route::get('/members', [InternalController::class, 'members']);
    Route::post('/world/seed', [InternalController::class, 'seed']);
    Route::put('/world/layout', [InternalController::class, 'layout']);
    Route::put('/world/playlists', [InternalController::class, 'playlists']);
    // the dark (docs/plan/30-the-dark.md): the Grounds' loot, someone's pockets
    Route::put('/world/loot', [DarkController::class, 'loot']);
    Route::get('/survivors/{userId}', [DarkController::class, 'survivor'])->whereNumber('userId');
    Route::put('/survivors/{userId}', [DarkController::class, 'saveSurvivor'])->whereNumber('userId');
    Route::put('/objects', [InternalController::class, 'upsertObject']);
    Route::delete('/objects/{uid}', [InternalController::class, 'deleteObject']);
    Route::post('/desk', [InternalController::class, 'desk']);
    Route::get('/spawn/{userId}', [InternalController::class, 'spawn'])->whereNumber('userId');
    Route::put('/spawn/{userId}', [InternalController::class, 'putSpawn'])->whereNumber('userId');
    Route::get('/last-spot/{userId}', [InternalController::class, 'lastSpot'])->whereNumber('userId');
    Route::put('/last-spots', [InternalController::class, 'putLastSpots']);
    Route::post('/perf-reports', [InternalController::class, 'perfReports']);
    Route::post('/presence', [InternalController::class, 'presence']);
    Route::post('/vortex', [InternalController::class, 'vortex']);
    Route::get('/games/{gameId}', [InternalController::class, 'game'])->whereNumber('gameId');
    Route::post('/phone/calls', [PhoneController::class, 'callLog']);
    // the GPS: who someone's contacts are (only they see where someone sharing is)
    Route::get('/phone/contacts/{userId}', [PhoneController::class, 'contactIds'])->whereNumber('userId');
    // pets belong to a person
    Route::prefix('pets/{userId}')->whereNumber('userId')->group(function () {
        Route::get('/', [InternalController::class, 'pets']);
        Route::post('/', [InternalController::class, 'createPet']);
        Route::put('/{petId}', [InternalController::class, 'savePet'])->whereNumber('petId');
        Route::delete('/{petId}', [InternalController::class, 'deletePet'])->whereNumber('petId');
    });
});
