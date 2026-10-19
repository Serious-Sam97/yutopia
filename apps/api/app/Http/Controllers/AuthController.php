<?php

namespace App\Http\Controllers;

use App\Models\Invite;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

// Yutopia's own accounts: email + password, Sanctum bearer tokens.
class AuthController extends Controller
{
    // what the sign-in page needs before anyone is signed in
    public function config(): JsonResponse
    {
        return response()->json(['worldName' => config('yutopia.world_name'), 'signup' => config('yutopia.signup')]);
    }

    public function invite(string $code): JsonResponse
    {
        $invite = Invite::where('code', $code)->first();
        abort_unless($invite?->isOpenFor(), 404);

        return response()->json(['email' => $invite->email, 'by' => $invite->creator?->name]);
    }

    public function register(Request $request): JsonResponse
    {
        $mode = config('yutopia.signup');
        abort_if($mode === 'closed', 403, 'Sign-up is closed.');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:60'],
            'email' => ['required', 'email', 'max:255', 'unique:users'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
            'invite' => [$mode === 'invite' ? 'required' : 'nullable', 'string', 'max:40'],
        ]);

        $user = DB::transaction(function () use ($data, $mode) {
            $invite = null;
            if ($mode === 'invite') {
                $invite = Invite::where('code', $data['invite'])->lockForUpdate()->first();
                if (! $invite?->isOpenFor($data['email'])) {
                    throw ValidationException::withMessages(['invite' => ['This invite is used, expired or for someone else.']]);
                }
            }
            $user = User::create([
                'name' => $data['name'],
                'email' => strtolower($data['email']),
                'password' => Hash::make($data['password']),
            ]);
            $invite?->forceFill(['used_by' => $user->id, 'used_at' => now()])->save();

            return $user;
        });
        $user->promoteIfListed();

        return response()->json(['token' => $user->createToken('yutopia')->plainTextToken, 'user' => $user->toPublic()], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $user = User::where('email', strtolower($data['email']))->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => ['The provided credentials are incorrect.']]);
        }
        $user->promoteIfListed();

        return response()->json(['token' => $user->createToken('yutopia')->plainTextToken, 'user' => $user->toPublic()]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $request->user()->toPublic()]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => ['required', 'email']]);
        Password::sendResetLink(['email' => strtolower($request->input('email'))]);

        // the same answer either way, so nobody learns who has an account
        return response()->json(['message' => 'If that email has an account, a reset link is on its way.']);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $status = Password::reset(
            ['email' => strtolower($request->input('email'))] + $request->only('password', 'password_confirmation', 'token'),
            function (User $user, string $password) {
                $user->forceFill(['password' => Hash::make($password)])->save();
                // a reset is the way back in after a compromise: every session ends
                $user->tokens()->delete();
                event(new PasswordReset($user));
            }
        );
        if ($status !== Password::PASSWORD_RESET) {
            throw ValidationException::withMessages(['email' => [__($status)]]);
        }

        return response()->json(['message' => 'Password reset.']);
    }
}
